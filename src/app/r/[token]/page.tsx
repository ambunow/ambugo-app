"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  collection,
  getDocs,
  limit,
  query,
  where,
  Timestamp,
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
  icu: "Μονάδα εντατικής θεραπείας (ΜΕΘ)",
  unknown: "Δεν είναι σίγουρος – να προτείνει η εταιρεία",
};

const statusLabel: Record<string, string> = {
  pending: "Σε αναμονή για προσφορές",
  offered: "Υπάρχουν διαθέσιμες προσφορές",
  booked: "Έχει γίνει κράτηση",
  completed: "Η μεταφορά ολοκληρώθηκε",
  cancelled: "Το αίτημα ακυρώθηκε",
};

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

export default function PublicRequestPage() {
  const params = useParams<{ token: string }>();
  const token = (params?.token as string) || "";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [request, setRequest] = useState<RequestDoc | null>(null);

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        // αν οι κανόνες το απαιτούν, κάνουμε ανώνυμο auth
        await ensureAnonAuth();

        const q = query(
          collection(db, "requests"),
          where("publicToken", "==", token),
          limit(1)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          setRequest(null);
          setErrorMsg("Δεν βρέθηκε αίτημα με αυτόν τον σύνδεσμο.");
          setLoading(false);
          return;
        }

        const d = snap.docs[0];
        const raw = d.data() as any;

        const docData: RequestDoc = {
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

        setRequest(docData);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setErrorMsg("Παρουσιάστηκε σφάλμα κατά τη φόρτωση του αιτήματος.");
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <section className="container py-10 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4 text-black">
        Το αίτημά σας για ασθενοφόρο
      </h1>

      {loading && (
        <div className="text-sm text-gray-600">Φόρτωση στοιχείων αιτήματος...</div>
      )}

      {!loading && errorMsg && (
        <div className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
          {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && request && (
        <div className="card p-6 space-y-4 text-sm">
          {/* status */}
          <div>
            <span className="text-xs font-medium text-gray-600">
              Κατάσταση αιτήματος
            </span>
            <div className="mt-1 text-base font-semibold text-black">
              {statusLabel[request.status || "pending"] ||
                request.status ||
                "Σε αναμονή"}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Μόλις οι συνεργαζόμενες εταιρείες καταχωρήσουν προσφορές,
              θα μπορείτε να τις δείτε εδώ στον ίδιο σύνδεσμο.
            </p>
          </div>

          <hr className="border-gray-200" />

          {/* βασικά στοιχεία */}
          <div className="space-y-2">
            <div>
              <span className="font-medium text-gray-700">Ημ/νία αίτησης:</span>{" "}
              <span>{formatDate(request.createdAt, "-")}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Ημερομηνία μεταφοράς:</span>{" "}
              <span>{request.date || "-"}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Ώρα παραλαβής:</span>{" "}
              <span>
                {request.timeFrom || request.timeTo
                  ? `${request.timeFrom || "--:--"} – ${
                      request.timeTo || "--:--"
                    }`
                  : "Οποιαδήποτε ώρα μέσα στην ημέρα"}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Είδος ασθενοφόρου:</span>{" "}
              <span>
                {request.ambulanceType
                  ? ambulanceTypeLabel[request.ambulanceType] ??
                    request.ambulanceType
                  : "-"}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Επείγον:</span>{" "}
              <span>
                {request.isEmergency ? "Ναι (επείγον περιστατικό)" : "Όχι (συνήθες)"}
              </span>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* διαδρομή */}
          <div className="space-y-2">
            <div>
              <span className="font-medium text-gray-700">Από:</span>
              <div className="whitespace-pre-line text-gray-900">
                {request.pickupText}
              </div>
            </div>
            <div>
              <span className="font-medium text-gray-700">Προς:</span>
              <div className="whitespace-pre-line text-gray-900">
                {request.destText}
              </div>
            </div>
          </div>

          {/* σχόλια πελάτη */}
          {request.comments && (
            <>
              <hr className="border-gray-200" />
              <div>
                <span className="font-medium text-gray-700">Σχόλια σας:</span>
                <div className="whitespace-pre-line text-gray-900 mt-1">
                  {request.comments}
                </div>
              </div>
            </>
          )}

          {/* placeholder για μελλοντικές προσφορές */}
          <hr className="border-gray-200" />
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Προσφορές από εταιρείες ασθενοφόρων
            </h2>
            <p className="text-sm text-gray-600">
              Αυτή η ενότητα θα ενημερώνεται όταν οι συνεργαζόμενες εταιρείες
              καταχωρούν προσφορές για το συγκεκριμένο αίτημα.
              Προς το παρόν δεν υπάρχουν διαθέσιμες προσφορές.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
