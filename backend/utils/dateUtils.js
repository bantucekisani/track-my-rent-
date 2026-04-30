// utils/dateUtils.js
exports.monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

exports.formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

exports.getCurrentMonthYear = () => {
  const d = new Date();
  return {
    month: exports.monthNames[d.getMonth()],
    year: d.getFullYear()
  };
};
