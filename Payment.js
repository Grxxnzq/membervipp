
const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  user_id: { type:mongoose.Schema.Types.ObjectId, ref:"User" },
  amount: Number,
  status: { type:String, default:"pending" },
  created_at: { type:Date, default:Date.now }
});

module.exports = mongoose.model("Payment", PaymentSchema);
