"use client";

import { useEffect, useMemo, useState } from "react";
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

// βοηθητικό για YYYY-MM-DD
function getYMD(date: Date) {
  return date.toISOString().split("T")[0];
}

export default function AdminPage() {
  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // φίλτρα & ταξινόμηση
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [emergencyFilter, setEmergencyFilter] = useState<
    "all" | "emergency" | "nonEmergency"
  >("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  // φίλτρο ημερομηνιών (βάσει Ημ/νίας μεταφοράς)
  const [dateFilterType, setDateFilterType] = useState<
    "today" | "yesterday" | "all" | "range"
  >("today");
  const [dateFrom, setDateFrom] = useState<string>(() => getYMD(new Date()));
  const [dateTo, setDateTo] = useState<string>(() => getYMD(new Date()));

  // για popup λεπτομερειών
  const [selectedRequest, setSelectedRequest] = useState<RequestDoc | null>(
    null
  );

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

  // εφαρμόζουμε φίλτρα & ταξινόμηση (η βάση είναι ήδη desc από Firestore)
  const filteredRequests = useMemo(() => {
    let result = [...requests];

    // φίλτρο κατάστασης
    if (statusFilter !== "all") {
      result = result.filter((r) => (r.status || "pending") === statusFilter);
    }

    // φίλτρο επείγοντος
    if (emergencyFilter === "emergency") {
      result = result.filter((r) => r.isEmergency);
    } else if (emergencyFilter === "nonEmergency") {
      result = result.filter((r) => !r.isEmergency);
    }

    // φίλτρο ημερομηνίας (βάσει r.date = Ημ/νία μεταφοράς)
    const todayStr = getYMD(new Date());
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterdayStr = getYMD(y);

    result = result.filter((r) => {
      const dateStr = (r.date || "").slice(0, 10);

      if (!dateFilterType || dateFilterType === "all") {
        return true;
      }

      switch (dateFilterType) {
        case "today":
          return dateStr === todayStr;
        case "yesterday":
          return dateStr === yesterdayStr;
        case "range": {
          if (!dateFrom && !dateTo) return true;
          if (!dateStr) return false;
          if (dateFrom && dateStr < dateFrom) return false;
          if (dateTo && dateStr > dateTo) return false;
          return true;
        }
        default:
          return true;
      }
    });

    // ταξινόμηση (τα δεδομένα έρχονται desc, οπότε για asc κάνουμε reverse)
    if (sortDir === "asc") {
      result.reverse();
    }

    return result;
  }, [
    requests,
    statusFilter,
    emergencyFilter,
    sortDir,
    dateFilterType,
    dateFrom,
    dateTo,
  ]);

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
        <>
          {/* Γραμμή φίλτρων */}
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Κατάσταση:</span>
              <select
                className="input !py-1 !text-xs w-48"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Όλες οι καταστάσεις</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Επείγον:</span>
              <select
                className="input !py-1 !text-xs w-44"
                value={emergencyFilter}
                onChange={(e) =>
                  setEmergencyFilter(
                    e.target.value as "all" | "emergency" | "nonEmergency"
                  )
                }
              >
                <option value="all">Όλα</option>
                <option value="emergency">Μόνο επείγοντα</option>
                <option value="nonEmergency">Μόνο μη επείγοντα</option>
              </select>
            </div>

            {/* Φίλτρο ημερομηνίας μεταφοράς */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-600">Ημ/νία μεταφοράς:</span>
              <select
                className="input !py-1 !text-xs w-52"
                value={dateFilterType}
                onChange={(e) =>
                  setDateFilterType(
                    e.target.value as "today" | "yesterday" | "all" | "range"
                  )
                }
              >
                <option value="today">Τρέχουσα ημέρα</option>
                <option value="yesterday">Προηγούμενη μέρα</option>
                <option value="all">Όλες οι μέρες</option>
                <option value="range">Διάστημα ημερών</option>
              </select>

              {dateFilterType === "range" && (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    className="input !py-1 !text-xs"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span className="text-xs text-gray-500">έως</span>
                  <input
                    type="date"
                    className="input !py-1 !text-xs"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="ml-auto text-xs text-gray-700 hover:text-black inline-flex items-center gap-1"
              onClick={() =>
                setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
              }
            >
              Ταξινόμηση κατά ημ/νία αίτησης
              <span>
                {sortDir === "desc"
                  ? "↓ (νεότερα πρώτα)"
                  : "↑ (παλαιότερα πρώτα)"}
              </span>
            </button>
          </div>

          {filteredRequests.length === 0 && (
            <div className="text-sm text-gray-600 mb-4">
              Δεν βρέθηκαν αιτήματα με αυτά τα φίλτρα.
            </div>
          )}

          {filteredRequests.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded-md overflow-hidden bg-white">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-black"
                        onClick={() =>
                          setSortDir((prev) =>
                            prev === "desc" ? "asc" : "desc"
                          )
                        }
                      >
                        Ημ/νία αίτησης
                        <span>{sortDir === "desc" ? "↓" : "↑"}</span>
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">Ημ/νία μεταφοράς</th>
                    <th className="px-3 py-2 text-left">Από</th>
                    <th className="px-3 py-2 text-left">Προς</th>
                    <th className="px-3 py-2 text-left">Ώρα</th>
                    <th className="px-3 py-2 text-left">Είδος</th>
                    <th className="px-3 py-2 text-left">Επείγον</th>
                    <th className="px-3 py-2 text-left">Πελάτης</th>
                    <th className="px-3 py-2 text-left">Επικοινωνία</th>
                    <th className="px-3 py-2 text-left">Κατάσταση</th>
                    <th className="px-3 py-2 text-left">Λεπτομέρειες</th>
                    <th className="px-3 py-2 text-left">Σχόλια</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => (
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
                          ? `${r.timeFrom || "--:--"} – ${
                              r.timeTo || "--:--"
                            }`
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
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => setSelectedRequest(r)}
                        >
                          Προβολή
                        </button>
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
        </>
      )}

      {/* Modal λεπτομερειών */}
      {selectedRequest && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Λεπτομέρειες αιτήματος
              </h2>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-800"
                onClick={() => setSelectedRequest(null)}
              >
                Κλείσιμο
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">
                  Ημ/νία αίτησης:
                </span>{" "}
                <span>{formatDate(selectedRequest.createdAt, "-")}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">
                  Ημ/νία μεταφοράς:
                </span>{" "}
                <span>{selectedRequest.date || "-"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Ώρα:</span>{" "}
                <span>
                  {selectedRequest.timeFrom || selectedRequest.timeTo
                    ? `${selectedRequest.timeFrom || "--:--"} – ${
                        selectedRequest.timeTo || "--:--"
                      }`
                    : "-"}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Από:</span>
                <div className="whitespace-pre-line">
                  {selectedRequest.pickupText}
                </div>
              </div>
              <div>
                <span className="font-medium text-gray-700">Προς:</span>
                <div className="whitespace-pre-line">
                  {selectedRequest.destText}
                </div>
              </div>
              <div>
                <span className="font-medium text-gray-700">
                  Είδος ασθενοφόρου:
                </span>{" "}
                <span>
                  {selectedRequest.ambulanceType
                    ? ambulanceTypeLabel[selectedRequest.ambulanceType] ??
                      selectedRequest.ambulanceType
                    : "-"}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Επείγον:</span>{" "}
                <span>
                  {selectedRequest.isEmergency ? "Ναι (επείγον)" : "Όχι (συνήθες)"}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Πελάτης:</span>{" "}
                <span>{selectedRequest.fullName || "-"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Email:</span>{" "}
                <span>{selectedRequest.email || "-"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Κινητό:</span>{" "}
                <span>{selectedRequest.phone || "-"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Σχόλια:</span>
                <div className="whitespace-pre-line">
                  {selectedRequest.comments || "-"}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="btn !px-4 !py-2 text-sm"
                onClick={() => setSelectedRequest(null)}
              >
                Κλείσιμο
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
