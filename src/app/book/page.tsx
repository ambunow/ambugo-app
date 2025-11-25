"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, ensureAnonAuth } from "@/lib/firebase";
import { useState } from "react";

export default function BookPage() {
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const form = e.currentTarget;
      const fd = new FormData(form);

      const pickup = (fd.get("pickup") as string || "").trim();
      const destination = (fd.get("destination") as string || "").trim();
      const date = (fd.get("date") as string || "").trim();
      const comments = (fd.get("comments") as string || "").trim();

      if (!pickup || !destination || !date) {
        setErrorMsg("Συμπλήρωσε παραλαβή, προορισμό και ημερομηνία.");
        setSubmitting(false);
        return;
      }

      await ensureAnonAuth();
      await addDoc(collection(db, "requests"), {
        pickup,
        destination,
        date,
        comments,
        createdAt: serverTimestamp(),
        source: "ambugo-web"
      });

      setSuccessMsg("✅ Το αίτημα καταχωρήθηκε! Θα λάβεις σύντομα προσφορές.");
      form.reset();
    } catch (err: any) {
      console.error(err);
      setErrorMsg("❌ Παρουσιάστηκε σφάλμα κατά την αποστολή. Δοκίμασε ξανά.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow p-8 relative z-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Φόρμα Αίτησης Ασθενοφόρου
        </h1>

        <form onSubmit={onSubmit} className="space-y-4" autoComplete="on">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Διεύθυνση Παραλαβής *
            </label>
            <input
              name="pickup"
              type="text"
              required
              placeholder="π.χ. Ευαγγελισμός, Αθήνα"
              className="w-full border border-gray-300 rounded-lg p-2 bg-white text-black placeholder-gray-500"
              autoComplete="street-address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Διεύθυνση Προορισμού *
            </label>
            <input
              name="destination"
              type="text"
              required
              placeholder="π.χ. Ιατρικό Κέντρο, Μαρούσι"
              className="w-full border border-gray-300 rounded-lg p-2 bg-white text-black placeholder-gray-500"
              autoComplete="street-address"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ημερομηνία *
            </label>
            <input
              name="date"
              type="date"
              required
              className="w-full border border-gray-300 rounded-lg p-2 bg-white text-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Σχόλια
            </label>
            <textarea
              name="comments"
              rows={3}
              placeholder="Οδηγίες, όροφος, ανάγκες υποστήριξης κ.λπ."
              className="w-full border border-gray-300 rounded-lg p-2 bg-white text-black placeholder-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {submitting ? "Αποστολή..." : "Θέλω Προσφορά"}
          </button>
        </form>

        {successMsg && (
          <p className="mt-4 text-green-600 text-center font-medium">{successMsg}</p>
        )}
        {errorMsg && (
          <p className="mt-4 text-red-600 text-center font-medium">{errorMsg}</p>
        )}
      </div>
    </main>
  );
}
