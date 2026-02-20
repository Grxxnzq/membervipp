
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  telegram_id: String,
  username: String,
  referral_code: String,
  referrer_id: String,
  affiliate_wallet: { type:Number, default:0 },
  expire_date: Date,
  status: { type:String, default:"inactive" },
  active_sessions: { type:Number, default:0 }
});

module.exports = mongoose.model("User", UserSchema);
