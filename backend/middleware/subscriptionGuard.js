const Subscription = require("../models/Subscription");

module.exports = async function(req,res,next){

try{

const subscription = await Subscription.findOne({
user:req.user.id
});

if(!subscription){
return res.status(403).json({
message:"No active subscription found"
});
}

if(subscription.status !== "active"){
return res.status(403).json({
message:"Your subscription is inactive. Please renew."
});
}

if(subscription.expiresAt && new Date() > subscription.expiresAt){

subscription.status = "expired";
await subscription.save();

return res.status(403).json({
message:"Subscription expired. Please upgrade."
});
}

req.subscription = subscription;

next();

}catch(err){

console.error("SUBSCRIPTION CHECK ERROR:",err);

res.status(500).json({
message:"Subscription verification failed"
});

}

};