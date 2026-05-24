import {ChangeDetectorRef, Component, NgModule, OnInit} from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { CommonModule, NgClass } from '@angular/common';
import {Auth} from '../../services/auth';
import {Httpcall} from '../../services/httpcall';
import {Router} from '@angular/router';
import { Student } from '../../models/student.model';

@Component({
  selector: 'students',
  imports: [FormsModule],
  templateUrl: './students.html',
  styleUrl: './students.css',
})
export class Students implements OnInit{
  constructor(private auth:Auth, private http:Httpcall,private router:Router,private cdr:ChangeDetectorRef) {  }
  loading:boolean=false;
  errorMessage:String = "";
  successMessage:String = "";
  students: Student[] = [];
  showStats: boolean=false;
  filtroCognome: string = "";
  showForm:boolean=false;
  interessiString: string = "";
  corsiString: string = "";
  formData: any = {
    nome: '',
    cognome: '',
    eta: null,
    indirizzo: {
      via: '',
      citta: '',
      CAP: ''
    }
  };
  isEditing: boolean = false;


  ngOnInit() {
    this.loadAll();
  }

  loadAll(){
    this.loading=true;
    this.errorMessage="";
    this.http.getCall('/api/students').subscribe({
      next: (res) =>{
        this.auth.saveToken(res.newToken);
        this.students=res.data;
        console.log(this.students);
        this.loading=false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading=false;
        this.errorMessage="Errore nel caricamento degli studenti";
        this.cdr.detectChanges();
      }
    });
  }

  caricaStatistiche() {

  }

  logout() {
    this.auth.logout();
    this.router.navigate(["/login"]);
  }

  cerca(){
    if (!this.filtroCognome || this.filtroCognome.trim() === "") {
      this.loadAll();
      return;
    }

    this.loading = true;
    this.errorMessage = "";
    this.successMessage = "";

    const body = { cognome: this.filtroCognome.trim() };

    this.http.postCall('/api/students/cercaPerCognome', body).subscribe({
      next: (res: any) => {
        this.auth.saveToken(res.newToken);
        
        this.students = res.data;
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = "Errore durante la ricerca degli studenti";
        this.cdr.detectChanges();
      }
    });
  }

  nuovoStudente() {
    this.formData = {
      nome: '',
      cognome: '',
      eta: null,
      indirizzo: { via: '', citta: '', CAP: '' }
    };
    this.interessiString = "";
    this.corsiString = "";
    this.showForm = true;
  }

  salva(){
    if(
      this.formData.nome && this.formData.nome != '' && 
      this.formData.cognome && this.formData.cognome != '' && 
      this.formData.eta != null && 
      this.formData.indirizzo?.via != '' && 
      this.formData.indirizzo?.citta != '' && 
      this.formData.indirizzo?.CAP != ''
    ){

      const interessiArray = this.interessiString
        ? this.interessiString.split(',').map(i => i.trim()).filter(i => i !== "")
        : [];

      const corsiArray = this.corsiString
        ? this.corsiString.split(',').map(c => {
            const [nomeCorso, voto] = c.split(':');
            return {
              nome: nomeCorso ? nomeCorso.trim() : '',
              voto: voto ? parseInt(voto.trim(), 10) : null
            };
          }).filter(c => c.nome !== "")
        : [];

      const body = {
        nome: this.formData.nome,
        cognome: this.formData.cognome,
        eta: this.formData.eta,
        indirizzo: this.formData.indirizzo,
        interessi: interessiArray,
        corsi: corsiArray
      };

      const url = this.isEditing ? '/api/students/modifica' : '/api/students/inserisci';
      const messaggioOk = this.isEditing ? "Studente modificato con successo!" : "Studente inserito con successo!";

      this.http.postCall(url, body).subscribe({
        next: (res: any) => {
          this.auth.saveToken(res.newToken);
          this.successMessage = messaggioOk; // CORRETTO (prima era mensajeOk)
          this.showForm = false;
          this.isEditing = false;
          this.loadAll();
        },
        error: (err) => {
          this.loading = false;
          this.errorMessage = "Errore durante il salvataggio dello studente";
          this.cdr.detectChanges();
        }
      });
    }
    else{
      this.errorMessage = "Inserisci tutti i campi!";
    }
  }

  annulla(){
    this.showForm = false;
    this.isEditing = false;
  }

  modificaStudente(s: Student) {
    this.isEditing = true;
    this.errorMessage = "";
    this.successMessage = "";
    
    this.formData = JSON.parse(JSON.stringify(s));
    
    this.interessiString = s.interessi ? s.interessi.join(', ') : "";
    this.corsiString = s.corsi ? s.corsi.map(c => `${c.nome}:${c.voto}`).join(', ') : "";
    
    this.showForm = true;
  }

  elimina(s: Student){
    console.log(s)
    this.loading = true;
    this.errorMessage = "";
    this.successMessage = "";
    const body = s;

    this.http.postCall('/api/students/elimina', body).subscribe({
      next: (res: any) => {
        this.auth.saveToken(res.newToken);
        this.successMessage = "Studente eliminato con successo!";
        this.loadAll();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = "Errore durante la cancellazione dello studente";
        this.cdr.detectChanges();
      }
    });
  }
}
