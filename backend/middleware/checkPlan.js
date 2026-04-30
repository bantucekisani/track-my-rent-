const permissions = require("../config/planPermissions");

module.exports = function(feature){

return function(req,res,next){

const userPlan = req.user.plan || "free";

if(!permissions[userPlan][feature]){
return res.status(403).json({
message:"Upgrade your plan to use this feature"
});
}

next();

};

};