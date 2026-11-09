module.exports={apps:[
 {name:'interview-rewards-api',cwd:__dirname+'/../backend',script:'dist/main.js',instances:1,exec_mode:'fork',max_memory_restart:'220M',node_args:'--max-old-space-size=160',env:{NODE_ENV:'production'}},
 {name:'interview-rewards-web',cwd:__dirname+'/../web',script:'node_modules/next/dist/bin/next',args:'start -H 172.18.0.1 -p 3410',instances:1,exec_mode:'fork',max_memory_restart:'200M',node_args:'--max-old-space-size=160',env:{NODE_ENV:'production'}}
]};
