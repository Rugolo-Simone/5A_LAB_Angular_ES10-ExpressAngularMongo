"use strict";

const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const HTTPS = require("https");
const cors = require("cors");
const tokenAdministration = require("./tokenAdministration");
const mongoFunctions = require("./mongoFunctions");

// ---- Costanti di configurazione ----
const PORT = 8888;
const DB = "anagrafica"; // nome del database MongoDB
const C_USERS = "users"; // collection per il login
const C_STUDENTS = "studenti"; // collection degli studenti

// ============================================================
//  CREAZIONE DEL SERVER HTTPS
//  fs.readFileSync legge i file in modo sincrono (bloccante).
//  Questo va bene all'avvio, prima che il server accetti richieste.
// ============================================================
const privateKey = fs.readFileSync("keys/privateKey.pem", "utf8"); 		// chiave privata TLS
const certificate = fs.readFileSync("keys/certificate.crt", "utf8"); 	// certificato TLS
const credentials = { key: privateKey, cert: certificate };

// Creazione dell'app Express che viene passata al server HTTPS.
// Express gestisce il routing, HTTPS gestisce la cifratura.
const app = express();
const httpsServer = HTTPS.createServer(credentials, app);

// Avviamo il server: ascoltiamo solo sull'interfaccia locale (127.0.0.1)
httpsServer.listen(PORT, "127.0.0.1", () => {
    console.log("=================================================");
    console.log(`  Server HTTPS avviato su https://127.0.0.1:${PORT}`);
    console.log("=================================================");
});

// ============================================================
//  MIDDLEWARE (funzioni eseguite ad ogni richiesta, in ordine)
// ============================================================
// CORS: abilita le richieste da origini diverse (es. Angular su porta 4200)
app.use(cors());
// Permette di leggere il body delle richieste in formato JSON
app.use(bodyParser.json());
// Permette di leggere il body in formato form-urlencoded (HTML form)
app.use(bodyParser.urlencoded({ extended: true }));



// Middleware di LOG: registra ogni richiesta in arrivo
app.use((req, res, next) => {
    const ora = new Date().toLocaleTimeString();
    console.log(`${ora} >>> ${req.method}: ${req.originalUrl}`);
    // Log dei parametri GET (query string)
    if (Object.keys(req.query).length > 0)
        console.log("  Query params: " + JSON.stringify(req.query));
    // Log dei parametri POST (body)
    if (req.body && Object.keys(req.body).length > 0)
        console.log("  Body params:  " + JSON.stringify(req.body));
    next(); // passa al middleware/route successivo
});


// ============================================================
//  FUNZIONE DI UTILITÀ: risposta di errore
//  Centralizzo la gestione degli errori per non ripetere codice.
// ============================================================
function sendError(res, code, message) {
    console.error(`  [${code}] ${message}`);
    res.status(code).send({ error: message });
}

// ============================================================
//  FUNZIONE DI UTILITÀ: middleware di verifica token
//  Da usare come parametro intermedio nelle route protette.
//  Esempio: app.get("/api/...", checkToken, (req,res) => { ... })
// ============================================================
function checkToken(req, res, next) {
    tokenAdministration.ctrlToken(req,(payload)=>{
        if(payload.err_exp)
            return sendError(res,403,payload.message);
        req.tokenPayload = payload;
        tokenAdministration.createToken(payload);
        req.newToken=tokenAdministration.token;
    });
}

// ============================================================
//  ROUTE: POST /api/login
//  Riceve username e password, cerca l'utente nel DB,
//  e se le credenziali sono corrette crea e restituisce il token JWT.
//
//  Body richiesto: { username: "...", password: "..." }
//  Risposta OK:    { msg: "Login OK", token: "eyJhbGci..." }
// ============================================================
app.post("/api/login", (req, res) => {
    console.log("Start login");
    const query = { user: req.body.username };
    mongoFunctions.findLogin(req,DB,C_USERS,query,(err,data)=>{
        if(err.codeErr == -1){  // Login OK
            tokenAdministration.createToken(data);
            res.send({ msg: "Login OK", token: tokenAdministration.token });
        }else{  // Login fallito
            sendError(res, err.codeErr, err.message);
        }
    });
});

// ============================================================
//  CRUD STUDENTS - tutte le route sono protette da checkToken
// ============================================================

// ----------------------------------------------------------
//  GET /api/students
//  Restituisce l'elenco COMPLETO degli studenti (nessun filtro).
//  È l'unica route in GET perché non riceve parametri dal client.
// ----------------------------------------------------------
app.get("/api/students", checkToken, (req, res) => {
    mongoFunctions.find(DB,C_STUDENTS,{},(err,data)=>{
        if(err.codeErr == -1)
            res.send({data:data, newToken:req.newToken});
        else
            sendError(res,err.codeErr,err.message);
    });
});

// ----------------------------------------------------------
//  POST /api/students/cerca
//  Ricerca studenti con un filtro passato dal client nel body.
//  Permette ricerche flessibili senza esporre la query nella URL.
//
//  Body esempio: { "cognome": "Rossi" }
//                { "indirizzo.città": "Roma" }
//                { "eta": 20 }
// ----------------------------------------------------------
app.post("/api/students/cerca", checkToken, (req, res) => {
    
});

// ----------------------------------------------------------
//  POST /api/students/cercaPerCognome
//  Restituisce gli studenti che hanno il cognome specificato.
//  Il cognome viene passato nel body.
//
//  Body richiesto: { "cognome": "Rossi" }
// ----------------------------------------------------------
app.post("/api/students/cercaPerCognome", checkToken, (req, res) => {
    
});

// ----------------------------------------------------------
//  POST /api/students/inserisci
//  Inserisce un nuovo studente nel database.
//
//  Body: { nome, cognome, eta, indirizzo: {...}, corsi: [...] }
//  Risposta: { msg: "Studente inserito", id: "..." }
// ----------------------------------------------------------
app.post("/api/students/inserisci", checkToken, (req, res) => {
    
});

// ----------------------------------------------------------
//  POST /api/students/modifica
//  Aggiorna i dati di uno studente cercandolo per nome e cognome.
//
//  Body: { "nome": "Mario", "cognome": "Rossi", "dati": { "eta": 22 } }
//  MongoDB usa $set per aggiornare SOLO i campi specificati,
//  lasciando intatti tutti gli altri campi del documento.
// ----------------------------------------------------------
app.post("/api/students/modifica", checkToken, (req, res) => {
    
});

// ----------------------------------------------------------
//  POST /api/students/elimina
//  Elimina uno studente cercandolo per nome e cognome.
//
//  Body: { "nome": "Mario", "cognome": "Rossi" }
// ----------------------------------------------------------
app.post("/api/students/elimina", checkToken, (req, res) => {
    
});

// ----------------------------------------------------------
//  POST /api/students/statistiche
//  Esegue una pipeline di aggregazione MongoDB passata dal client.
//  La pipeline è un array di "stage" che trasformano i dati.
// ----------------------------------------------------------
app.post("/api/students/statistiche", checkToken, (req, res) => {
    
});

// ============================================================
//  MIDDLEWARE FINALE: gestione risorsa non trovata (404)
//  Deve essere l'ULTIMO app.use perché cattura tutto ciò che
//  non è stato gestito dalle route precedenti.
// ============================================================
app.use((req, res) => {
    console.log("404 - Risorsa non trovata: " + req.originalUrl);
    res.status(404).json({ error: "Risorsa non trovata: " + req.originalUrl });
});