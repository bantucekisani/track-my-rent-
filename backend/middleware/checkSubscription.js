const Subscription = require("../models/Subscription");

module.exports = async function(req,res,next){

try{

const subscription = await Subscription.findOne({
user:req.user.id
});

if(!subscription){
return res.status(403).json({
message:"No subscription found"
});
}

// Check expiry
if(subscription.expiresAt && new Date() > subscription.expiresAt){

subscription.status = "expired";
await subscription.save();

return res.status(403).json({
message:"Subscription expired. Please renew."
});

}

req.subscription = subscription;

next();

}catch(err){

console.error(err);
res.status(500).json({message:"Subscription check failed"});

}

};