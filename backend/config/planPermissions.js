const permissions = {

free: {
units: 2,
invoices: false,
notifications: false,
expenses: false,
advancedReports: false,
bankImport: false,
aiAssistant: false
},

starter: {
units: 10,
invoices: true,
notifications: true,
expenses: true,
advancedReports: false,
bankImport: false,
aiAssistant: false
},

growth: {
units: 50,
invoices: true,
notifications: true,
expenses: true,
advancedReports: true,
bankImport: true,
aiAssistant: true
},

pro: {
units: Infinity,
invoices: true,
notifications: true,
expenses: true,
advancedReports: true,
bankImport: true,
aiAssistant: true
}

};

module.exports = permissions;