import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Apinator } from '@apinator/server';

const required=['APINATOR_APP_ID','APINATOR_KEY','APINATOR_SECRET'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
const realtime=new Apinator({appId:process.env.APINATOR_APP_ID,key:process.env.APINATOR_KEY,secret:process.env.APINATOR_SECRET,cluster:process.env.APINATOR_CLUSTER||'eu'});
const app=express();
app.use(cors({origin:true,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','X-ESF-User','X-ESF-Name']}));
app.use(express.json({limit:'16kb'}));
app.get('/',(_req,res)=>res.type('text').send('EsF online room auth server is running.'));
app.get('/health',(_req,res)=>res.json({ok:true,service:'esf-online',region:process.env.APINATOR_CLUSTER||'eu'}));
app.post('/api/realtime/auth',(req,res)=>{
  try {
    const {socket_id,channel_name}=req.body||{};
    if(typeof socket_id!=='string'||typeof channel_name!=='string'||!/^presence-esf-[A-Z0-9]{4,8}$/.test(channel_name)) return res.status(400).json({error:'Invalid room'});
    const userId=String(req.get('x-esf-user')||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);
    const name=String(req.get('x-esf-name')||'Oyuncu').replace(/[<>\r\n]/g,'').trim().slice(0,18)||'Oyuncu';
    if(!userId) return res.status(400).json({error:'Missing player id'});
    const channel_data=JSON.stringify({user_id:userId,user_info:{name}});
    const auth=realtime.authenticateChannel(socket_id,channel_name,channel_data);
    res.json(auth);
  } catch(err) { console.error('Channel auth failed:',err); res.status(500).json({error:'Channel authorization failed'}); }
});
const port=Number(process.env.PORT||3000);
app.listen(port,'0.0.0.0',()=>console.log(`EsF online auth server listening on ${port}`));
