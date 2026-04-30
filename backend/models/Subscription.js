const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({

user:{
type:mongoose.Schema.Types.ObjectId,
ref:"User",
required:true
},

plan:{
type:String,
enum:["free","starter","growth","pro"],
default:"free"
},

status:{
type:String,
enum:["active","expired","cancelled","past_due"],
default:"active"
},

maxUnits:{
type:Number,
default:2
},

currency:{
type:String,
default:"ZAR"
},

// Paystack identifiers
paystackCustomerCode:{
type:String,
default:null
},

paystackSubscriptionCode:{
type:String,
default:null
},

paystackEmailToken:{
type:String,
default:null
},

startedAt:{
type:Date,
default:Date.now
},

expiresAt:{
type:Date,
default:null
},

nextBillingDate:{
type:Date,
default:null
}

},{
timestamps:true
});

module.exports = mongoose.model("Subscription",subscriptionSchema);