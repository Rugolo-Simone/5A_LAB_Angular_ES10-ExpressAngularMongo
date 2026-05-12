"use strict";

const jwt = require("jsonwebtoken");
const fs = require("fs");

class TokenAdministration{
    constructor() {
        this.privateKey = fs.readFileSync("keys/private.key","UTF8");
        this.token="";
        this.payload={};
    }

    createToken(user){
        this.token = jwt.sign({
            "_id":user._id,
            "user":user.user,
            "exp": Math.floor(Date.now()/1000)+3600 //durata di un'ora
            },
            this.privateKey
        );
        console.log(`Token creato correttamente per l'utente ${user.user}`);
    }

    ctrlToken(req, callback){
        const headerToken = req.headers["token"];
        if(!headerToken)
            return callback({err_exp:true, message:"Header token mancante"});
        const token=headerToken.split(" ")[1];
        if(!token || token === "null")
            return callback({err_exp:true, message:"Token inesistente o corrotto"});
        jwt.verify(token, this.privateKey, (err,data)=>{
            if(!err){   // se non ho errori in data ci finisce il payload del token
                this.payload = data;
            }else{
                this.payload = {err_exp:true, message:"Token presente ma scaduto o corrotto"};
            }
            callback(this.payload);
        });
    }
}

module.exports = new  TokenAdministration();