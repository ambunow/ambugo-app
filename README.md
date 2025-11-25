# Ambugo Web App (app.ambulancenow.gr)

Next.js (App Router) + Tailwind + Firebase (anonymous auth + Firestore) starter για το subdomain **app.ambulancenow.gr**.

## 1) Τοπικά
```bash
npm i
cp .env.local.example .env.local
# Βάλε Firebase Web credentials (Project settings → SDK setup and configuration)
npm run dev
```

## 2) Firestore
- Φτιάξε collection: `requests`
- Development rules παράδειγμα:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /requests/{doc} {
      allow create: if request.auth != null;
      allow read: if false;
    }
  }
}
```
> Σε production, κλείδωσέ τα κατάλληλα.

## 3) GitHub Repo
```bash
git init
git add .
git commit -m "Ambugo webapp init"
gh repo create ambugo-webapp --public --source=. --remote=origin --push
# ή φτιάξε repo στο GitHub και:
git remote add origin https://github.com/<user>/ambugo-webapp.git
git push -u origin main
```

## 4) Vercel Project
1. Σύνδεσε το repo στο Vercel → New Project → Import.  
2. Environment Variables (Production/Preview):  
   - NEXT_PUBLIC_FIREBASE_API_KEY  
   - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN  
   - NEXT_PUBLIC_FIREBASE_PROJECT_ID  
   - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET  
   - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID  
   - NEXT_PUBLIC_FIREBASE_APP_ID  
3. Deploy.

## 5) Subdomain: `app.ambulancenow.gr`
- Στο Vercel: Project → Settings → Domains → Add `app.ambulancenow.gr`  
- Αν το domain `ambulancenow.gr` είναι ήδη στο Vercel, απλώς προσθέτεις το subdomain.  
- Αν είναι σε άλλο registrar/DNS, πρόσθεσε **CNAME**:  
  - Host: `app`  
  - Value: `cname.vercel-dns.com`  
- Περίμενε το DNS propagation και είσαι έτοιμος.

## 6) Branding
- App name: **Ambugo — by AmbulanceNow**  
- Open Graph / manifest ρυθμισμένα.  
- Placeholder icons (`public/icon-192.png`, `public/icon-512.png`) — άλλαξέ τα με τα τελικά.

---

© 2025 Ambugo — by AmbulanceNow
