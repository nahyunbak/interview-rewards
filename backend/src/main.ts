import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  Res,
  HttpException,
} from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import cookieParser from "cookie-parser";
import {
  hash,
  token,
  equal,
  parseStudy,
  payoutStatus,
  score,
  amount,
  Chain,
  Mode,
  Snapshot,
  Turn,
  Evaluation,
} from "./domain";
import { addressValid, verifyWallet, processPayouts, explorer } from "./chain";
import { transcribe, speak, nextQuestion, judge } from "./ai";
const db = new PrismaClient();
const origin = process.env.PUBLIC_ORIGIN || "http://localhost:3410";
const adminSessions = new Map<string, number>();
const fail = (message: string, status = 400): never => {
  throw new HttpException(message, status);
};
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api",
  maxAge: 8 * 3600 * 1000,
};
function admin(req: Request) {
  const expires = adminSessions.get(hash(req.cookies?.admin || ""));
  if (!expires || expires < Date.now())
    fail("운영자 로그인이 필요합니다.", 401);
}
async function owned(req: Request, id: string) {
  const i = await db.interview.findUnique({
    where: { id },
    include: { payout: true },
  });
  if (
    !i ||
    !equal(i.sessionHash, hash(req.cookies?.participant || "")) ||
    i.expiresAt.getTime() < Date.now()
  )
    return fail(
      "인터뷰 접근 권한이 없습니다. 초대 링크에서 지갑을 다시 연결해주세요.",
      401,
    );
  return i;
}
function view(i: Awaited<ReturnType<typeof owned>>) {
  const evaluation = i.evaluation
    ? (JSON.parse(i.evaluation) as Evaluation)
    : null;
  const snapshot = JSON.parse(i.snapshot) as Snapshot;
  return {
    id: i.id,
    title: snapshot.title,
    chain: i.chain,
    address: i.address,
    mode: i.mode,
    status: i.status,
    questions: snapshot.questions,
    currentQuestion: i.currentQuestion,
    turns: JSON.parse(i.transcript),
    evaluation,
    score: evaluation ? score(evaluation) : null,
    error: i.error,
    payout: i.payout
      ? {
          status: i.payout.status,
          amount: i.payout.amount,
          error: i.payout.error,
          txId: i.payout.txId,
          url: i.payout.txId ? explorer(i.chain, i.payout.txId) : null,
        }
      : null,
  };
}
const max = (chain: Chain) =>
  process.env[chain === "base" ? "BASE_MAX_REWARD" : "SOLANA_MAX_REWARD"] ||
  (chain === "base" ? "10000000000000" : "1000000");
async function evaluate(id: string) {
  const i = await db.interview.findUniqueOrThrow({ where: { id } });
  try {
    const snapshot = JSON.parse(i.snapshot) as Snapshot;
    const turns = JSON.parse(i.transcript) as Turn[];
    const evaluation = await judge(snapshot, turns);
    await db.$transaction(async (tx) => {
      const current = await tx.interview.findUniqueOrThrow({ where: { id } });
      if (current.status !== "evaluating") return;
      await tx.interview.update({
        where: { id },
        data: {
          evaluation: JSON.stringify(evaluation),
          status: evaluation.needs_review ? "review_required" : "completed",
          error: evaluation.needs_review ? evaluation.review_reason : null,
          busyUntil: null,
        },
      });
      if (!evaluation.needs_review) {
        const reward = amount(evaluation, snapshot.maxAmount);
        await tx.payout.create({
          data: {
            interviewId: id,
            amount: reward,
            status: payoutStatus(i.mode as Mode, reward),
          },
        });
      }
    });
  } catch {
    await db.interview.updateMany({
      where: { id, status: "evaluating" },
      data: {
        status: "review_required",
        error:
          "AI 평가를 완료하지 못했습니다. 운영자가 확인 후 재평가할 수 있습니다.",
        busyUntil: null,
      },
    });
  }
}
@Controller("api")
class Api {
  @Get("health") health() {
    return { ok: true, network: "testnet" };
  }
  @Post("admin/login") login(
    @Body() body: { token?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      !process.env.ADMIN_TOKEN ||
      process.env.ADMIN_TOKEN.length < 32 ||
      !equal(body.token || "", process.env.ADMIN_TOKEN)
    )
      fail("운영자 인증 실패", 401);
    const value = token();
    adminSessions.set(hash(value), Date.now() + 8 * 3600 * 1000);
    res.cookie("admin", value, options);
    return { ok: true };
  }
  @Post("admin/logout") logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    adminSessions.delete(hash(req.cookies?.admin || ""));
    res.clearCookie("admin", options);
    return { ok: true };
  }
  @Get("admin/interviews") async list(@Req() req: Request) {
    admin(req);
    return (
      await db.interview.findMany({
        include: { payout: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    ).map(view);
  }
  @Get("admin/config") config(@Req() req: Request) {
    admin(req);
    return {
      openaiConfigured: !!process.env.OPENAI_API_KEY,
      payoutEnabled: process.env.PAYOUT_ENABLED === "true",
      baseKeyConfigured: !!process.env.BASE_PRIVATE_KEY,
      solanaKeyConfigured: !!process.env.SOLANA_SECRET_KEY,
      baseMax: max("base"),
      solanaMax: max("solana"),
    };
  }
  @Post("admin/studies") async study(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ) {
    admin(req);
    let data;
    try {
      data = parseStudy(body);
    } catch (e) {
      return fail((e as Error).message);
    }
    const study = await db.study.create({
      data: {
        ...data,
        maxAmount: JSON.stringify({ base: max("base"), solana: max("solana") }),
      },
    });
    const value = token();
    await db.invite.create({
      data: {
        studyId: study.id,
        tokenHash: hash(value),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    return { id: study.id, url: `${origin}/?invite=${value}` };
  }
  @Post("admin/payouts/:id/approve") async approve(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    admin(req);
    return db.$transaction(async (tx) => {
      const payout = await tx.payout.findUnique({
        where: { interviewId: id },
        include: { interview: true },
      });
      if (
        !payout ||
        payout.interview.mode !== "manual" ||
        payout.interview.status !== "completed"
      )
        return fail("승인할 수 없는 평가입니다.", 409);
      if (payout.status !== "awaiting_approval")
        return { status: payout.status };
      await tx.payout.update({
        where: { id: payout.id },
        data: { status: "queued", approvedAt: new Date() },
      });
      await tx.audit.create({ data: { action: "approve", targetId: id } });
      return { status: "queued" };
    });
  }
  @Post("admin/interviews/:id/rejudge") async rejudge(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    admin(req);
    const changed = await db.interview.updateMany({
      where: { id, status: "review_required", payout: null },
      data: {
        status: "evaluating",
        busyUntil: new Date(Date.now() + 180000),
        error: null,
      },
    });
    if (!changed.count) return fail("재평가할 수 없는 상태입니다.", 409);
    await db.audit.create({ data: { action: "rejudge", targetId: id } });
    void evaluate(id);
    return { status: "evaluating" };
  }
  @Get("invites/:token") async invite(@Param("token") value: string) {
    const i = await db.invite.findUnique({
      where: { tokenHash: hash(value) },
      include: { study: true },
    });
    if (!i || !i.study.active || i.expiresAt.getTime() < Date.now())
      return fail("초대가 없거나 만료되었습니다.", 410);
    return {
      title: i.study.title,
      context: i.study.context,
      questionCount: JSON.parse(i.study.questions).length,
      mode: i.study.mode,
      rewards: JSON.parse(i.study.maxAmount),
      aiReady: !!process.env.OPENAI_API_KEY,
    };
  }
  @Post("auth/challenge") async challenge(
    @Body() body: { invite?: string; chain?: Chain; address?: string },
  ) {
    if (
      !["base", "solana"].includes(body.chain || "") ||
      typeof body.address !== "string" ||
      !addressValid(body.chain!, body.address)
    )
      return fail("지갑 주소와 네트워크를 확인해주세요.");
    const i = await db.invite.findUnique({
      where: { tokenHash: hash(body.invite || "") },
      include: { study: true },
    });
    if (!i || !i.study.active || i.expiresAt.getTime() < Date.now())
      return fail("초대가 만료되었습니다.", 410);
    const message = `Interview Rewards\nOrigin: ${origin}\nInvite: ${i.id}\nNetwork: ${body.chain === "base" ? "Base Sepolia (84532)" : "Solana Devnet"}\nAddress: ${body.address}\nNonce: ${token()}\nExpires: ${new Date(Date.now() + 300000).toISOString()}\n인터뷰 참여 및 리워드 수령 주소 확인. 송금이나 토큰 승인이 아닙니다.`;
    const c = await db.challenge.create({
      data: {
        inviteId: i.id,
        chain: body.chain!,
        address: body.address,
        message,
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    return { id: c.id, message };
  }
  @Post("auth/verify") async verify(
    @Body()
    body: {
      id?: string;
      signature?: string;
      provider?: string;
      consent?: boolean;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      !body.id ||
      typeof body.signature !== "string" ||
      body.signature.length > 2000 ||
      !["metamask", "phantom"].includes(body.provider || "") ||
      body.consent !== true
    )
      return fail("지갑 서명과 개인정보 처리 동의가 필요합니다.");
    const c = await db.challenge.findUnique({ where: { id: body.id } });
    if (!c || c.used || c.expiresAt.getTime() < Date.now())
      return fail("서명 요청이 만료되었습니다.", 401);
    if (
      !(await verifyWallet(
        c.chain as Chain,
        c.address,
        c.message,
        body.signature,
      ).catch(() => false))
    )
      return fail("서명 검증 실패", 401);
    const session = token();
    const result = await db.$transaction(async (tx) => {
      const used = await tx.challenge.updateMany({
        where: { id: c.id, used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });
      if (!used.count) return fail("이미 사용된 서명입니다.", 401);
      const invite = await tx.invite.findUniqueOrThrow({
        where: { id: c.inviteId },
        include: { study: true, interview: true },
      });
      if (invite.expiresAt.getTime() < Date.now() || !invite.study.active)
        return fail("초대가 만료되었습니다.", 410);
      if (invite.interview) {
        const old = invite.interview;
        if (old.chain !== c.chain || old.address !== c.address)
          return fail("기존 참여 지갑과 네트워크를 사용해주세요.", 409);
        return tx.interview.update({
          where: { id: old.id },
          data: {
            sessionHash: hash(session),
            expiresAt: new Date(Date.now() + 8 * 3600000),
          },
        });
      }
      if (!process.env.OPENAI_API_KEY)
        return fail("운영자가 AI 연결을 준비 중입니다.", 503);
      const maximum = JSON.parse(invite.study.maxAmount)[c.chain] as string;
      const reservations = await tx.interview.findMany({
        where: { chain: c.chain, status: { not: "cancelled" } },
        select: { snapshot: true, payout: { select: { amount: true } } },
      });
      const usedBudget = reservations.reduce(
        (n, r) =>
          n +
          BigInt(
            r.payout?.amount || (JSON.parse(r.snapshot) as Snapshot).maxAmount,
          ),
        0n,
      );
      const budget = BigInt(
        process.env[c.chain === "base" ? "BASE_BUDGET" : "SOLANA_BUDGET"] ||
          "0",
      );
      if (usedBudget + BigInt(maximum) > budget)
        return fail("현재 네트워크의 리워드 예산이 부족합니다.", 409);
      const snapshot: Snapshot = {
        title: invite.study.title,
        context: invite.study.context,
        questions: JSON.parse(invite.study.questions),
        maxAmount: maximum,
        judgeModel: process.env.JUDGE_MODEL || "gpt-4.1-mini",
      };
      return tx.interview.create({
        data: {
          inviteId: invite.id,
          chain: c.chain,
          address: c.address,
          provider: body.provider!,
          sessionHash: hash(session),
          expiresAt: new Date(Date.now() + 8 * 3600000),
          mode: invite.study.mode,
          snapshot: JSON.stringify(snapshot),
        },
      });
    });
    res.cookie("participant", session, options);
    return { id: result.id };
  }
  @Get("interviews/:id") async result(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    return view(await owned(req, id));
  }
  @Post("interviews/:id/start") async start(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await owned(req, id);
    await db.interview.updateMany({
      where: { id, status: "ready" },
      data: { status: "in_progress" },
    });
    return view(await owned(req, id));
  }
  @Post("interviews/:id/question") async question(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const i = await owned(req, id);
    if (i.status !== "in_progress")
      return fail("진행 중인 인터뷰가 아닙니다.", 409);
    const s = JSON.parse(i.snapshot) as Snapshot;
    const turns = JSON.parse(i.transcript) as Turn[];
    if (i.currentQuestion)
      return { question: i.currentQuestion, index: turns.length };
    const question = await nextQuestion(s, turns, turns.length);
    await db.interview.updateMany({
      where: {
        id,
        status: "in_progress",
        transcript: i.transcript,
        currentQuestion: null,
      },
      data: { currentQuestion: question },
    });
    const current = await db.interview.findUniqueOrThrow({ where: { id } });
    return { question: current.currentQuestion, index: turns.length };
  }
  @Post("interviews/:id/speech") async speech(
    @Req() req: Request,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const i = await owned(req, id);
    if (i.status !== "in_progress")
      return fail("진행 중인 인터뷰가 아닙니다.", 409);
    const turns = JSON.parse(i.transcript) as Turn[];
    const q =
      i.currentQuestion ||
      (JSON.parse(i.snapshot) as Snapshot).questions[turns.length];
    if (!q) return fail("질문이 끝났습니다.", 409);
    res.type("audio/mpeg").send(await speak(q));
  }
  @Post("interviews/:id/answer") async answer(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { audio?: string; type?: string; index?: number },
  ) {
    const i = await owned(req, id);
    const turns = JSON.parse(i.transcript) as Turn[];
    const s = JSON.parse(i.snapshot) as Snapshot;
    if (
      i.status !== "in_progress" ||
      body.index !== turns.length ||
      !s.questions[turns.length]
    )
      return fail("질문 상태가 변경되었습니다. 새로고침해주세요.", 409);
    if (
      typeof body.audio !== "string" ||
      body.audio.length < 100 ||
      body.audio.length > 14000000 ||
      !["audio/webm", "audio/webm;codecs=opus", "audio/mp4"].includes(
        body.type || "",
      )
    )
      return fail("최대 10MB의 음성 답변만 지원합니다.");
    const locked = await db.interview.updateMany({
      where: {
        id,
        status: "in_progress",
        transcript: i.transcript,
        OR: [{ busyUntil: null }, { busyUntil: { lt: new Date() } }],
      },
      data: { busyUntil: new Date(Date.now() + 180000) },
    });
    if (!locked.count) return fail("답변 처리 중입니다.", 409);
    try {
      const text = await transcribe(
        Buffer.from(body.audio, "base64"),
        body.type!,
      );
      turns.push({
        id: String(turns.length),
        question: i.currentQuestion || s.questions[turns.length]!,
        answer: text,
      });
      await db.interview.updateMany({
        where: { id, status: "in_progress" },
        data: { transcript: JSON.stringify(turns), currentQuestion: null },
      });
      return { answer: text };
    } finally {
      await db.interview.update({ where: { id }, data: { busyUntil: null } });
    }
  }
  @Post("interviews/:id/finish") async finish(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const i = await owned(req, id);
    if (["evaluating", "completed", "review_required"].includes(i.status))
      return { status: i.status };
    if (
      i.status !== "in_progress" ||
      JSON.parse(i.transcript).length !==
        (JSON.parse(i.snapshot) as Snapshot).questions.length
    )
      return fail("모든 질문에 답변해주세요.", 409);
    const changed = await db.interview.updateMany({
      where: { id, status: "in_progress", busyUntil: null },
      data: { status: "evaluating", busyUntil: new Date(Date.now() + 180000) },
    });
    if (changed.count) void evaluate(id);
    return { status: "evaluating" };
  }
  @Post("interviews/:id/cancel") async cancel(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await owned(req, id);
    const c = await db.interview.updateMany({
      where: { id, status: { in: ["ready", "in_progress"] }, busyUntil: null },
      data: { status: "cancelled" },
    });
    if (!c.count)
      return fail("처리 중이거나 이미 종료되어 중단할 수 없습니다.", 409);
    return { status: "cancelled" };
  }
  @Delete("interviews/:id/data") async remove(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const i = await owned(req, id);
    if (!["completed", "cancelled"].includes(i.status))
      return fail("진행·검토 중에는 운영자에게 삭제를 요청해주세요.", 409);
    await db.interview.update({
      where: { id },
      data: { transcript: "[]", evaluation: null },
    });
    await db.audit.create({
      data: { action: "delete_transcript", targetId: id },
    });
    return { ok: true };
  }
}
@Module({ controllers: [Api] })
class AppModule {}
async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn"],
  });
  app.useBodyParser("json", { limit: "15mb" });
  app.use(cookieParser());
  const limits = new Map<string, { count: number; reset: number }>();
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(req.method) && req.headers.origin !== origin)
      return res
        .status(403)
        .json({ message: "허용되지 않은 요청 출처입니다." });
    const key = String(req.socket.remoteAddress) + req.path;
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + 60000 };
      limits.set(key, entry);
    }
    if (++entry.count > 60)
      return res.status(429).json({ message: "잠시 후 다시 시도해주세요." });
    next();
  });
  // Crash recovery never interprets an incomplete evaluation as a zero score.
  await db.interview.updateMany({
    where: { status: "evaluating" },
    data: {
      status: "review_required",
      busyUntil: null,
      error: "평가 중 서버가 재시작되었습니다. 재평가가 필요합니다.",
    },
  });
  await db.interview.updateMany({
    where: { status: "in_progress" },
    data: { busyUntil: null },
  });
  let working = false;
  setInterval(async () => {
    if (working) return;
    working = true;
    try {
      await processPayouts(db);
    } catch {
      console.error("지급 상태 조회 실패");
    } finally {
      working = false;
    }
  }, 10000).unref();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of limits) if (v.reset < now) limits.delete(k);
    for (const [k, v] of adminSessions) if (v < now) adminSessions.delete(k);
    void db.challenge
      .deleteMany({ where: { expiresAt: { lt: new Date(now - 86400000) } } })
      .catch(() => undefined);
    void db.interview
      .updateMany({
        where: {
          createdAt: { lt: new Date(now - 30 * 86400000) },
          status: { in: ["completed", "cancelled"] },
        },
        data: { transcript: "[]", evaluation: null },
      })
      .catch(() => undefined);
  }, 60000).unref();
  await app.listen(Number(process.env.PORT || 3411), "127.0.0.1");
}
void main();
