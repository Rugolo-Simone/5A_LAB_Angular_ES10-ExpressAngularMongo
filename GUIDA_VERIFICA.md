# GUIDA VERIFICA — Angular + Express + MongoDB
> Basata esattamente sul codice del progetto `ES10-ExpressAngularMongo`

---

## INDICE RAPIDO
1. [Avvio del progetto](#1-avvio-del-progetto)
2. [Struttura del progetto](#2-struttura-del-progetto)
3. [Express.js — Server](#3-expressjs--server)
4. [MongoDB — mongoFunctions.js](#4-mongodb--mongofunctionsjs)
5. [JWT — tokenAdministration.js](#5-jwt--tokenadministrationjs)
6. [Angular — Struttura Client](#6-angular--struttura-client)
7. [Angular — Servizi](#7-angular--servizi)
8. [Angular — Componenti](#8-angular--componenti)
9. [Angular — Routing](#9-angular--routing)
10. [Flusso completo Login → Dati](#10-flusso-completo-login--dati)
11. [Completare le route vuote (CRUD)](#11-completare-le-route-vuote-crud)
12. [Cheatsheet rapido](#12-cheatsheet-rapido)

---

## 1. AVVIO DEL PROGETTO

```bash
# Terminale 1 — Server Express
cd server
node server.js           # avvia su http://127.0.0.1:8888

# Terminale 2 — Client Angular
cd client
ng serve                 # avvia su http://localhost:4200
```

MongoDB deve già girare in background (mongod).

---

## 2. STRUTTURA DEL PROGETTO

```
ES10-ExpressAngularMongo/
├── server/
│   ├── server.js              ← Express: route e middleware
│   ├── mongoFunctions.js      ← Classe MongoDB (CRUD + login + aggregate)
│   ├── tokenAdministration.js ← Classe JWT (crea e verifica token)
│   ├── DB/
│   │   ├── users.json         ← utenti di test
│   │   └── Students2024.json  ← studenti di test
│   └── keys/                  ← chiavi TLS e private key JWT
│
└── client/src/app/
    ├── models/student.model.ts      ← interfacce TypeScript
    ├── services/
    │   ├── auth.ts                  ← login, token in localStorage
    │   └── httpcall.ts              ← GET/POST autenticati
    ├── pages/
    │   ├── login/login.ts           ← componente Login
    │   └── students/students.ts     ← componente Students
    └── app.routes.ts                ← routing dell'app
```

---

## 3. EXPRESS.JS — SERVER

### 3.1 Setup base

```js
const express    = require("express");
const bodyParser = require("body-parser");
const cors       = require("cors");

const app = express();
const PORT = 8888;

// MIDDLEWARE (ordine importante: prima cors, poi bodyParser, poi log, poi route)
app.use(cors());                                   // abilita richieste da Angular (porta 4200)
app.use(bodyParser.json());                        // legge body JSON
app.use(bodyParser.urlencoded({ extended: true }));// legge body form

app.listen(PORT, () => console.log(`Server avviato su porta ${PORT}`));
```

### 3.2 Middleware: cos'è e perché `next()`

Un **middleware** è una funzione `(req, res, next)` che viene eseguita
per ogni richiesta. Deve chiamare `next()` per passare al middleware/route
successivo. Se non chiama `next()`, la richiesta si blocca.

```js
// Middleware di LOG (nel progetto)
app.use((req, res, next) => {
    const ora = new Date().toLocaleTimeString();
    console.log(`${ora} >>> ${req.method}: ${req.originalUrl}`);
    next(); // FONDAMENTALE: passa alla route
});
```

### 3.3 Route — Tipi e parametri

| Tipo | Dove si trovano i dati | Come si leggono      |
|------|------------------------|----------------------|
| GET  | Query string URL       | `req.query.campo`    |
| POST | Body della richiesta   | `req.body.campo`     |
| -    | Header HTTP            | `req.headers["nome"]`|

```js
// GET — dati in URL: /api/students?nome=Mario
app.get("/api/students", (req, res) => {
    const nome = req.query.nome;    // "Mario"
    res.send({ data: [] });
});

// POST — dati nel body JSON: { "nome": "Mario" }
app.post("/api/login", (req, res) => {
    const username = req.body.username;
    res.send({ token: "..." });
});
```

### 3.4 Funzione sendError (utility nel progetto)

```js
function sendError(res, code, message) {
    console.error(`[${code}] ${message}`);
    res.status(code).send({ error: message });
}
// Utilizzo: sendError(res, 401, "Non autorizzato");
// Codici: 401=non autorizzato, 403=forbidden, 404=non trovato, 500=errore server, 503=db non disponibile
```

### 3.5 Middleware checkToken (protezione route)

```js
// Funzione middleware: va come secondo parametro della route
function checkToken(req, res, next) {
    tokenAdministration.ctrlToken(req, (payload) => {
        if (payload.err_exp)
            return sendError(res, 403, payload.message); // token invalido → blocca
        req.tokenPayload = payload;                      // salva payload nel req
        tokenAdministration.createToken(payload);        // rinnova token
        req.newToken = tokenAdministration.token;        // token rinnovato
        next();                                          // token OK → prosegui
    });
}

// Uso: aggiungo checkToken come secondo parametro
app.get("/api/students", checkToken, (req, res) => { /* ... */ });
//                        ^^^^^^^^^^ ← middleware di protezione
```

### 3.6 Middleware 404 finale

```js
// DEVE essere ULTIMO: cattura tutto ciò che non ha trovato una route
app.use((req, res) => {
    res.status(404).json({ error: "Risorsa non trovata: " + req.originalUrl });
});
```

---

## 4. MONGODB — mongoFunctions.js

### 4.1 Pattern generale

Ogni metodo:
1. Chiama `#setConnection(db, collection, callback)`
2. La callback riceve `(errConn, coll, conn)`
3. Esegue l'operazione sulla `coll`
4. Chiama `.finally(() => conn.close())` per chiudere la connessione

L'oggetto errore standard è `{ codeErr: -1, message: "" }` quando va bene,
oppure `{ codeErr: 500, message: "..." }` quando c'è un errore.

### 4.2 Connessione MongoDB

```js
const CONNECTIONSTRING = "mongodb://127.0.0.1:27017";

mongoClient.connect(CONNECTIONSTRING)
    .then((client) => {
        const db   = client.db("anagrafica");      // seleziona il database
        const coll = db.collection("studenti");    // seleziona la collection
        // ... operazioni ...
        client.close();                            // chiudi dopo l'uso
    })
    .catch((err) => console.error(err));
```

### 4.3 Metodi disponibili in mongoFunctions.js

#### `find(db, collection, query, callback)` — Legge documenti

```js
// Tutti gli studenti (query vuota = nessun filtro)
mongoFunctions.find(DB, C_STUDENTS, {}, (err, data) => {
    if (err.codeErr == -1) res.send({ data: data, newToken: req.newToken });
    else sendError(res, err.codeErr, err.message);
});

// Solo studenti con cognome "Rossi"
mongoFunctions.find(DB, C_STUDENTS, { cognome: "Rossi" }, (err, data) => { ... });
```

#### `findLogin(req, db, collection, query, callback)` — Login

```js
const query = { user: req.body.username };
mongoFunctions.findLogin(req, DB, C_USERS, query, (err, data) => {
    if (err.codeErr == -1) {  // Login OK
        tokenAdministration.createToken(data);
        res.send({ msg: "Login OK", token: tokenAdministration.token });
    } else {
        sendError(res, err.codeErr, err.message);
    }
});
// Codici: 401=username inesistente o password errata, 503=DB non disponibile
```

#### `findOptions(db, collection, query, sort, limit, callback)` — Con opzioni

```js
// Primi 5 studenti ordinati per cognome A→Z
mongoFunctions.findOptions(DB, C_STUDENTS, {}, { cognome: 1 }, 5, (err, data) => { ... });
// sort: 1=ASC (A→Z), -1=DESC (Z→A)
// limit: 0=nessun limite, >0=massimo N risultati
```

#### `insert(db, collection, documento, callback)` — Inserisce

```js
const nuovoStudente = {
    nome: req.body.nome,
    cognome: req.body.cognome,
    eta: req.body.eta
};
mongoFunctions.insert(DB, C_STUDENTS, nuovoStudente, (err, result) => {
    if (err.codeErr == -1)
        res.send({ msg: "Studente inserito", id: result.insertedId });
    else sendError(res, err.codeErr, err.message);
});
```

#### `update(db, collection, filter, update, callback)` — Modifica

```js
const filter = { nome: req.body.nome, cognome: req.body.cognome };
const update = { $set: req.body.dati };  // $set aggiorna SOLO i campi specificati
mongoFunctions.update(DB, C_STUDENTS, filter, update, (err, result) => {
    if (err.codeErr == -1)
        res.send({ msg: "Studente modificato", modificati: result.modifiedCount });
    else sendError(res, err.codeErr, err.message);
});
```

#### `delete(db, collection, filter, callback)` — Elimina

```js
const filter = { nome: req.body.nome, cognome: req.body.cognome };
mongoFunctions.delete(DB, C_STUDENTS, filter, (err, result) => {
    if (err.codeErr == -1)
        res.send({ msg: "Studente eliminato", eliminati: result.deletedCount });
    else sendError(res, err.codeErr, err.message);
});
```

#### `aggregate(db, collection, pipeline, callback)` — Aggregazione

```js
// Esempio: conta studenti per città
const pipeline = [
    { $group: { _id: "$indirizzo.citta", totale: { $sum: 1 } } },
    { $sort: { totale: -1 } }
];
mongoFunctions.aggregate(DB, C_STUDENTS, pipeline, (err, data) => {
    if (err.codeErr == -1)
        res.send({ data: data, newToken: req.newToken });
    else sendError(res, err.codeErr, err.message);
});
```

### 4.4 Operatori MongoDB da sapere

| Operatore | Scopo                          | Esempio                                          |
|-----------|--------------------------------|--------------------------------------------------|
| `$set`    | Aggiorna solo i campi indicati | `{ $set: { eta: 22 } }`                          |
| `$match`  | Filtro (come WHERE in SQL)     | `{ $match: { eta: { $gt: 18 } } }`               |
| `$group`  | Raggruppa e calcola            | `{ $group: { _id: "$citta", tot: { $sum: 1 } } }`|
| `$sort`   | Ordina risultati               | `{ $sort: { cognome: 1 } }` (1=ASC, -1=DESC)     |
| `$limit`  | Limita i risultati             | `{ $limit: 10 }`                                 |
| `$gt`     | Maggiore di                    | `{ eta: { $gt: 18 } }`                           |
| `$lt`     | Minore di                      | `{ eta: { $lt: 30 } }`                           |
| `$gte`    | Maggiore o uguale              | `{ eta: { $gte: 18 } }`                          |
| `$lte`    | Minore o uguale                | `{ eta: { $lte: 30 } }`                          |

---

## 5. JWT — tokenAdministration.js

### 5.1 Cos'è un JWT

Un JWT (JSON Web Token) è una stringa in 3 parti separate da `.`:
```
eyJhbGci...  .  eyJ1c2Vy...  .  SflKxwR...
   HEADER         PAYLOAD        FIRMA
```
- **Header**: algoritmo usato (es. RS256)
- **Payload**: dati dell'utente (id, username, scadenza) — leggibili da chiunque
- **Firma**: garantisce che il token non sia stato alterato — richiede la chiave privata

### 5.2 Creazione token

```js
createToken(user) {
    this.token = jwt.sign(
        {
            "_id":  user._id,
            "user": user.user,
            "exp":  Math.floor(Date.now() / 1000) + 3600  // scade dopo 1 ora
        },
        this.privateKey   // firmato con chiave privata RSA
    );
}
```

### 5.3 Verifica token

```js
ctrlToken(req, callback) {
    const headerToken = req.headers["token"];         // legge l'header "token"
    if (!headerToken)
        return callback({ err_exp: true, message: "Header token mancante" });

    const token = headerToken.split(" ")[1];          // estrae la parte dopo "Bearer "
    if (!token || token === "null")
        return callback({ err_exp: true, message: "Token inesistente o corrotto" });

    jwt.verify(token, this.privateKey, (err, data) => {
        if (!err)
            this.payload = data;                      // payload decodificato (OK)
        else
            this.payload = { err_exp: true, message: "Token scaduto o corrotto" };
        callback(this.payload);
    });
}
```

### 5.4 Flusso token completo

```
Client                          Server
  |                               |
  |── POST /api/login ──────────→ |
  |   { username, password }      |
  |                               |── cerca utente in MongoDB
  |                               |── verifica password
  |                               |── crea token JWT
  |←─ { msg, token } ────────── ─|
  |                               |
  |── GET /api/students ─────────→|
  |   Header: token: Bearer eyJ...|
  |                               |── checkToken: verifica JWT
  |                               |── rinnova token
  |                               |── esegue query MongoDB
  |←─ { data, newToken } ─────── ─|
  |                               |
  |── salva newToken              | (Angular lo salva in localStorage)
```

---

## 6. ANGULAR — STRUTTURA CLIENT

### 6.1 Componente Angular (struttura base)

```typescript
@Component({
    selector: 'nome-tag',
    imports: [FormsModule, CommonModule],
    templateUrl: './nome.html',
    styleUrl: './nome.css',
})
export class NomeComponente implements OnInit {
    // Proprietà (variabili del componente)
    titolo: string = "Ciao";
    lista: Tipo[] = [];
    loading: boolean = false;
    errorMessage: string = "";

    // Iniezione dipendenze nel costruttore
    constructor(private auth: Auth, private http: Httpcall, private router: Router) {}

    // Lifecycle hook: eseguito quando il componente è pronto
    ngOnInit(): void {
        this.caricaDati();
    }

    caricaDati(): void { ... }
}
```

### 6.2 Template HTML — Direttive Angular

```html
<!-- *ngFor: ciclo su una lista -->
<tr *ngFor="let student of students">
    <td>{{ student.nome }}</td>
    <td>{{ student.cognome }}</td>
</tr>

<!-- *ngIf: mostra/nasconde elemento -->
<div *ngIf="loading">Caricamento...</div>
<div *ngIf="errorMessage">{{ errorMessage }}</div>
<div *ngIf="students.length === 0">Nessuno studente trovato</div>

<!-- [(ngModel)]: two-way binding — richiede FormsModule -->
<input [(ngModel)]="credentials.username" type="text">
<input [(ngModel)]="credentials.password" type="password">

<!-- (click): event binding -->
<button (click)="onSubmit()">Invia</button>
<button (click)="logout()">Logout</button>

<!-- [disabled]: disabilita elemento condizionalmente -->
<button [disabled]="loading">Invia</button>
```

### 6.3 Imports necessari nei componenti

```typescript
import { CommonModule }     from '@angular/common';   // *ngIf, *ngFor
import { FormsModule }      from '@angular/forms';    // [(ngModel)]
import { Router }           from '@angular/router';   // navigazione
import { ChangeDetectorRef } from '@angular/core';    // forza aggiornamento vista
```

---

## 7. ANGULAR — SERVIZI

### 7.1 Auth service (auth.ts)

```typescript
// Login: invia credenziali, salva token, restituisce Observable
login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, credentials)
        .pipe(
            tap(response => {
                if (response.token)
                    localStorage.setItem(this.TOKEN_KEY, response.token);
            })
        );
}

logout():         void    { localStorage.removeItem(this.TOKEN_KEY); }
saveToken(t):     void    { localStorage.setItem(this.TOKEN_KEY, t); }
getToken():       string  { return localStorage.getItem(this.TOKEN_KEY); }
isLoggedIn():     boolean { return this.getToken() !== null; }
```

### 7.2 Httpcall service (httpcall.ts)

```typescript
// Header con JWT — il server legge req.headers["token"], NON "Authorization"
private getHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders().set('token', `Bearer ${token}`);
}

getCall(endpoint: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}${endpoint}`, { headers: this.getHeaders() });
}

postCall(endpoint: string, body: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}${endpoint}`, body, { headers: this.getHeaders() });
}
```

### 7.3 Come usare i servizi in un componente

```typescript
// Chiamata GET
this.http.getCall('/api/students').subscribe({
    next: (res) => {
        this.auth.saveToken(res.newToken);  // rinnova token
        this.students = res.data;
        this.loading = false;
        this.cdr.detectChanges();
    },
    error: (err) => {
        this.loading = false;
        this.errorMessage = "Errore nel caricamento";
        this.cdr.detectChanges();
    }
});

// Chiamata POST
this.http.postCall('/api/students/cerca', { cognome: 'Rossi' }).subscribe({
    next: (res) => {
        this.auth.saveToken(res.newToken);
        this.students = res.data;
    },
    error: (err) => { this.errorMessage = "Errore"; }
});
```

### 7.4 Observable e subscribe

```
Observable = flusso di dati asincrono
subscribe() = "mi abbono" per ricevere i dati

.subscribe({
    next:  (dati)  => { /* dati ricevuti correttamente */ },
    error: (err)   => { /* qualcosa è andato storto    */ }
})

IMPORTANTE: senza subscribe(), la chiamata HTTP non parte mai!
```

---

## 8. ANGULAR — COMPONENTI

### 8.1 Login component (login.ts)

```typescript
export class Login {
    credentials: LoginRequest = { username: 'user', password: 'pwd' };
    errorMessage = "";
    loading = false;

    constructor(private auth: Auth, private router: Router) {
        if (this.auth.isLoggedIn())          // se già loggato
            this.router.navigate(['/students']); // vai direttamente a students
    }

    onSubmit(): void {
        this.errorMessage = "";
        this.loading = true;
        this.auth.login(this.credentials).subscribe({
            next: (response) => {
                this.loading = false;
                if (response.token)
                    this.router.navigate(['/students']); // login OK → naviga
                else
                    this.errorMessage = response.msg || "Credenziali non valide";
            },
            error: (err) => {
                this.loading = false;
                this.errorMessage = "Errore di connessione al server";
            }
        });
    }
}
```

### 8.2 Students component (students.ts)

```typescript
export class Students implements OnInit {
    students: Student[] = [];
    loading: boolean = false;
    errorMessage: String = "";

    constructor(
        private auth: Auth,
        private http: Httpcall,
        private router: Router,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit() { this.loadAll(); }

    loadAll() {
        this.loading = true;
        this.http.getCall('/api/students').subscribe({
            next: (res) => {
                this.auth.saveToken(res.newToken);  // rinnova token
                this.students = res.data;
                this.loading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.loading = false;
                this.errorMessage = "Errore nel caricamento degli studenti";
                this.cdr.detectChanges();
            }
        });
    }

    logout() {
        this.auth.logout();
        this.router.navigate(["/login"]);
    }
}
```

---

## 9. ANGULAR — ROUTING

### 9.1 Configurazione route (app.routes.ts)

```typescript
export const routes: Routes = [
    { path: '',         redirectTo: 'login', pathMatch: 'full' }, // root → login
    { path: 'login',    component: Login    },
    { path: 'students', component: Students },
    { path: '**',       redirectTo: 'login', pathMatch: 'full' }, // 404 → login
];
```

### 9.2 Navigazione da codice

```typescript
constructor(private router: Router) {}

this.router.navigate(['/students']);
this.router.navigate(['/login']);
```

### 9.3 Router outlet nel template (app.html)

```html
<!-- Il componente della route attiva viene renderizzato qui -->
<router-outlet></router-outlet>
```

---

## 10. FLUSSO COMPLETO LOGIN → DATI

```
1. Browser apre http://localhost:4200
   └─ app.routes.ts: path '' → redirect a 'login'
   └─ Login component si carica

2. Utente inserisce username/password nel form HTML
   └─ [(ngModel)] aggiorna credentials.username e credentials.password in real-time

3. Click "Invia" → Login.onSubmit()
   └─ auth.login(credentials) → POST http://127.0.0.1:8888/api/login
      Body: { "username": "mario", "password": "1234" }

4. Server Express riceve POST /api/login
   └─ mongoFunctions.findLogin() → cerca { user: "mario" } in MongoDB
   └─ confronta password
   └─ tokenAdministration.createToken(utente) → crea JWT
   └─ risponde: { msg: "Login OK", token: "eyJ..." }

5. Auth.login() riceve la risposta
   └─ tap(): localStorage.setItem('jwt_token', token)
   └─ Observable propaga risposta al componente Login

6. Login.onSubmit() riceve next(response)
   └─ router.navigate(['/students'])

7. Students component si carica → ngOnInit() → loadAll()
   └─ http.getCall('/api/students')
      └─ getHeaders(): legge token da localStorage
      └─ GET http://127.0.0.1:8888/api/students
         Header: token: Bearer eyJ...

8. Server Express riceve GET /api/students
   └─ checkToken middleware:
      └─ legge req.headers["token"]
      └─ estrae "Bearer eyJ..." → "eyJ..."
      └─ jwt.verify() → payload OK
      └─ rinnova token → req.newToken
      └─ next() → passa alla route handler
   └─ mongoFunctions.find(DB, C_STUDENTS, {})
   └─ risponde: { data: [...], newToken: "eyJ..." }

9. Students.loadAll() riceve next(res)
   └─ auth.saveToken(res.newToken) → aggiorna token nel localStorage
   └─ this.students = res.data
   └─ cdr.detectChanges() → aggiorna il template HTML
```

---

## 11. COMPLETARE LE ROUTE VUOTE (CRUD)

### POST /api/students/cerca

```js
app.post("/api/students/cerca", checkToken, (req, res) => {
    const query = req.body;   // es. { cognome: "Rossi" } o { eta: 20 }
    mongoFunctions.find(DB, C_STUDENTS, query, (err, data) => {
        if (err.codeErr == -1)
            res.send({ data: data, newToken: req.newToken });
        else
            sendError(res, err.codeErr, err.message);
    });
});
```

### POST /api/students/cercaPerCognome

```js
app.post("/api/students/cercaPerCognome", checkToken, (req, res) => {
    const query = { cognome: req.body.cognome };
    mongoFunctions.find(DB, C_STUDENTS, query, (err, data) => {
        if (err.codeErr == -1)
            res.send({ data: data, newToken: req.newToken });
        else
            sendError(res, err.codeErr, err.message);
    });
});
```

### POST /api/students/inserisci

```js
app.post("/api/students/inserisci", checkToken, (req, res) => {
    const documento = req.body;
    mongoFunctions.insert(DB, C_STUDENTS, documento, (err, result) => {
        if (err.codeErr == -1)
            res.send({ msg: "Studente inserito", id: result.insertedId, newToken: req.newToken });
        else
            sendError(res, err.codeErr, err.message);
    });
});
```

### POST /api/students/modifica

```js
app.post("/api/students/modifica", checkToken, (req, res) => {
    const filter = { nome: req.body.nome, cognome: req.body.cognome };
    const update = { $set: req.body.dati };
    mongoFunctions.update(DB, C_STUDENTS, filter, update, (err, result) => {
        if (err.codeErr == -1)
            res.send({ msg: "Studente modificato", modificati: result.modifiedCount, newToken: req.newToken });
        else
            sendError(res, err.codeErr, err.message);
    });
});
```

### POST /api/students/elimina

```js
app.post("/api/students/elimina", checkToken, (req, res) => {
    const filter = { nome: req.body.nome, cognome: req.body.cognome };
    mongoFunctions.delete(DB, C_STUDENTS, filter, (err, result) => {
        if (err.codeErr == -1)
            res.send({ msg: "Studente eliminato", eliminati: result.deletedCount, newToken: req.newToken });
        else
            sendError(res, err.codeErr, err.message);
    });
});
```

### POST /api/students/statistiche

```js
app.post("/api/students/statistiche", checkToken, (req, res) => {
    const pipeline = req.body.pipeline;
    mongoFunctions.aggregate(DB, C_STUDENTS, pipeline, (err, data) => {
        if (err.codeErr == -1)
            res.send({ data: data, newToken: req.newToken });
        else
            sendError(res, err.codeErr, err.message);
    });
});
```

---

## 12. CHEATSHEET RAPIDO

### Interfacce TypeScript del modello (student.model.ts)

```typescript
interface Student {
    _id?: string;          // opzionale: assente nella creazione, presente dopo il salvataggio
    nome: string;
    cognome: string;
    eta: number;
    indirizzo?: Indirizzo; // { via, citta, CAP }
    interessi?: string[];
    corsi?: Corso[];       // { nome, voto }
    dataIscrizione?: string;
    dataNascita?: string;
}
```

### Struttura risposta server standard

```
Successo: { data: [...], newToken: "eyJ..." }
Login OK: { msg: "Login OK", token: "eyJ..." }
Errore:   { error: "messaggio" }  + status HTTP appropriato
```

### Costanti server.js

```js
const PORT       = 8888;
const DB         = "anagrafica";
const C_USERS    = "users";
const C_STUDENTS = "studenti";
```

### Errori codeErr di mongoFunctions

| codeErr | Significato                               |
|---------|-------------------------------------------|
| -1      | Nessun errore (OK)                        |
| 401     | Username o password errati (login)        |
| 500     | Errore interno MongoDB (operazione)       |
| 503     | Connessione al server MongoDB fallita     |

### Lifecycle hooks Angular

| Hook            | Quando viene chiamato                         |
|-----------------|-----------------------------------------------|
| `ngOnInit()`    | Dopo la prima inizializzazione del componente |
| `ngOnDestroy()` | Prima che il componente venga distrutto       |

### `@Injectable({ providedIn: 'root' })` — perché?

Dice ad Angular di creare **una sola istanza** del servizio per tutta l'app
(Singleton pattern). Ogni componente che inietta `Auth` o `Httpcall`
riceve la stessa istanza.

### `ChangeDetectorRef.detectChanges()` — perché?

Angular aggiorna il template automaticamente dopo eventi standard (click, input).
Ma quando i dati arrivano da un Observable asincrono, a volte bisogna
forzare l'aggiornamento manualmente con `this.cdr.detectChanges()`.

### `tap()` di RxJS — cos'è

Esegue un effetto collaterale senza modificare i dati del flusso.
Nel progetto serve per salvare il token nel localStorage *prima*
che il componente riceva la risposta.

```
Observable → tap(salva token) → componente riceve risposta invariata
```

### `module.exports = new Classe()` — pattern Singleton

```js
module.exports = new MongoFunctions();    // mongoFunctions.js
module.exports = new TokenAdministration(); // tokenAdministration.js
```
Entrambi i moduli esportano una singola istanza già creata,
non la classe. Chi fa `require()` riceve sempre la stessa istanza.

---

*Guida generata il 24 maggio 2026 — basata sul codice reale del progetto ES10*
