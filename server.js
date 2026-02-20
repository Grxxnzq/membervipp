
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const User = require("./models/User");
const Payment = require("./models/Payment");

const app = express();
app.use(express.json());
app.use(express.static("public"));

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("Mongo Connected"));

const SESSION_LIMIT = 1;
const AFFILIATE_PERCENT = 20;

// Login with session limit
app.post("/api/login", async (req,res)=>{
  const { telegram_id, username, ref } = req.body;
  let user = await User.findOne({ telegram_id });

  if(!user){
    user = await User.create({
      telegram_id,
      username,
      referral_code: telegram_id.slice(-6),
      referrer_id: ref || null
    });
  }

  if(user.active_sessions >= SESSION_LIMIT){
    return res.status(403).json({message:"Session limit reached"});
  }

  user.active_sessions += 1;
  await user.save();

  const token = jwt.sign({id:user._id}, process.env.JWT_SECRET);
  res.json({token, user});
});

// Logout
app.post("/api/logout", async (req,res)=>{
  const { telegram_id } = req.body;
  const user = await User.findOne({ telegram_id });
  if(user && user.active_sessions > 0){
    user.active_sessions -= 1;
    await user.save();
  }
  res.json({message:"Logged out"});
});

// Approve payment + affiliate + auto invite
app.post("/api/admin/approve", async (req,res)=>{
  const { payment_id } = req.body;
  const payment = await Payment.findById(payment_id).populate("user_id");
  const user = payment.user_id;

  const expire = new Date();
  expire.setDate(expire.getDate()+30);

  user.expire_date = expire;
  user.status = "active";
  await user.save();

  payment.status = "approved";
  await payment.save();

  // Affiliate reward
  if(user.referrer_id){
    const ref = await User.findOne({telegram_id:user.referrer_id});
    if(ref){
      const commission = (payment.amount * AFFILIATE_PERCENT)/100;
      ref.affiliate_wallet += commission;
      await ref.save();
    }
  }

  // Auto invite link
  const invite = await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/createChatInviteLink`,
    { chat_id: process.env.TELEGRAM_GROUP_ID, member_limit:1 }
  );

  await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    { chat_id: user.telegram_id, text: "ลิงก์เข้ากลุ่ม: "+invite.data.result.invite_link }
  );

  res.json({message:"Approved + Invite sent"});
});

// Revenue stats
app.get("/api/admin/revenue", async (req,res)=>{
  const payments = await Payment.find({status:"approved"});
  const totalRevenue = payments.reduce((sum,p)=>sum+p.amount,0);
  res.json({ totalRevenue });
});

// Expiry check
cron.schedule("0 0 * * *", async ()=>{
  const users = await User.find({status:"active"});
  for(let user of users){
    const diff = (user.expire_date - new Date())/(1000*60*60*24);
    if(diff<=0){
      user.status="expired";
      await user.save();
      await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/banChatMember`,
        { chat_id:process.env.TELEGRAM_GROUP_ID, user_id:user.telegram_id }
      );
    }
  }
});

app.listen(process.env.PORT || 5000, ()=>{
  console.log("Server running");
});
