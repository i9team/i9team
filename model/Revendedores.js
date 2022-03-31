const mysql = require('mysql2');
const db = require('./db');


const revendedores = db.query("SELECT * FROM revendedores;", function (err, result) {
    try {
        return result;
  } catch(err) {
      console.log(err);
  }
});

module.exports = revendedores;