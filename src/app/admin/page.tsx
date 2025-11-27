"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db, ensureAnonAuth } from "@/lib/firebase";

type RequestDoc = {
  id: string;
  pickupText: string;
  destText: string;
  date?: string;
  timeFrom?: string | null;
  timeTo?: string | null;
  ambulanceType?: string;
  isEmergency?: boolean;
  email?: string;
  fullName?: string;
  phone?: string;
  comments?: string;
  createdAt?: Timestamp | null;
  status?: string;
  source?: string;
};

const ambulanceTypeLabel: Record<string, string> = {
  basic: "Απλό ασθενοφόρο",
  doctor: "Με συνοδεία ιατρού",
  icu: "ΜΕΘ",
  unknown: "Δεν είναι σίγουρος",
};

const statusOptions = [
  { value: "pending", label: "Σε αναμονή" },
  { value: "offered", label: "Στάλθηκαν προσφορές" },
  { value: "booked", label: "Έγινε κράτηση" },
  { value: "completed", label: "Ολοκληρώθηκε" },
  { value: "cancelled", label: "Ακυρώθηκε" },
];

function formatDate(ts?: Timestamp | null, fallback?: string) {
  if (ts && ts.toDate) {
    const d = ts.toDate();
    return d.toLocaleString("el-GR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return fallback || "-";
}

export default function AdminPage() {
  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        // Αν οι κανόνες Firestore το απαιτούν, σιγουρευόμαστε ότι υπάρχει auth
        await ensureAnonAuth();

        const q = query(
          collection(db, "requests"),
          orderBy("createdAt", "desc")
        );

        unsub = onSnapshot(
          q,
          (snap) => {
            const data: RequestDoc[] = snap.docs.map((d) => {
              const raw = d.data() as any;
              return {
                id: d.id,
                pickupText: raw.pickupText ?? "",
                destText: raw.destText ?? "",
                date: raw.date ?? "",
                timeFrom: raw.timeFrom ?? null,
                timeTo: raw.timeTo ?? null,
                ambulanceType: raw.ambulanceType ?? "",
                isEmergency: !!raw.isEmergency,
                email: raw.email ?? "",
                fullName: raw.fullName ?? "",
                phone: raw.phone ?? "",
                comments: raw.comments ?? "",
                createdAt: raw.createdAt ?? null,
                status: raw.status ?? "pending",
                source: raw.source ?? "",
              };
            });
            setRequests(data);
            setLoading(false);
          },
          (err) => {
            console.error(err);
            setErrorMsg("Σφάλμα κατά τη φόρτωση των αιτημάτων.");
            setLoading(false);
          }
        );
      } catch (err) {
        console.error(err);
        setErrorMsg("Αποτυχία σύνδεσης στο Firestore.");
        setLoading(false);
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      setUpdatingId(id);
      await updateDoc(doc(db, "requests", id), {
        status: newStatus,
      });
    } catch (err) {
      console.error(err);
      setErrorMsg("Αποτυχία ενημέρωσης κατάστασης.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="container py-10">
      <h1 className="text-2xl font-semibold mb-6 text-black">
        Πίνακας Αιτημάτων Ασθενοφόρου
      </h1>

      {loading && <div className="text-sm text-gray-600">Φόρτωση...</div>}
      {errorMsg && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
          {errorMsg}
        </div>
      )}

      {!loading && requests.length === 0 && (
        <div className="text-sm text-gray-600">Δεν υπάρχουν αιτήματα.</div>
      )}

      {requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-200 rounded-md overflow-hidden bg-white">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Ημ/νία αίτησης</th>
                <th className="px-3 py-2 text-left">Ημ/νία μεταφοράς</th>
                <th className="px-3 py-2 text-left">Από</th>
                <th className="px-3 py-2 text-left">Προς</th>
                <th className="px-3 py-2 text-left">Ώρα</th>
                <th className="px-3 py-2 text-left">Είδος</th>
                <th className="px-3 py-2 text-left">Επείγον</th>
                <th className="px-3 py-2 text-left">Πελάτης</th>
                <th className="px-3 py-2 text-left">Επικοινωνία</th>
                <th className="px-3 py-2 text-left">Κατάσταση</th>
                <th className="px-3 py-2 text-left">Σχόλια</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-gray-200 hover:bg-gray-50 align-top"
                >
                  <td className="px-3 py-2">
                    {formatDate(r.createdAt, "-")}
                  </td>
                  <td className="px-3 py-2">{r.date || "-"}</td>
                  <td className="px-3 py-2 max-w-xs">
                    <div className="line-clamp-2">{r.pickupText}</div>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <div className="line-clamp-2">{r.destText}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.timeFrom || r.timeTo
                      ? `${r.timeFrom || "--:--"} – ${r.timeTo || "--:--"}`
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {r.ambulanceType
                      ? ambulanceTypeLabel[r.ambulanceType] ??
                        r.ambulanceType
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {r.isEmergency ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Επείγον
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        Συνήθες
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-sm text-gray-900">
                      {r.fullName || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1 text-xs">
                      {r.email && (
                        <a
                          href={`mailto:${r.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {r.email}
                        </a>
                      )}
                      {r.phone && <span>{r.phone}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="input !py-1 !text-xs"
                      value={r.status || "pending"}
                      onChange={(e) =>
                        handleStatusChange(r.id, e.target.value)
                      }
                      disabled={updatingId === r.id}
                    >
                      {statusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    <div className="line-clamp-3 text-xs text-gray-700 whitespace-pre-line">
                      {r.comments || "-"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
