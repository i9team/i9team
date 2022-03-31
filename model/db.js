const mysql = require('mysql2');


const db_host = "127.0.0.1";
const db_name = "revendas_tve";
const db_user = "root";
const db_pass = "";

config = {
	host: db_host,
	user: db_user,
	password: db_pass,
	database: db_name
}
var connection =mysql.createConnection(config); //added the line
connection.connect(function(err){
	if (err){
		console.log('error connecting:' + err.stack);
	}
	console.log("Connected to MySQL Server");
});

module.exports ={
	connection : mysql.createConnection(config) 
}