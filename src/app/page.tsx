"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, ensureAnonAuth } from "@/lib/firebase";

type PlaceInfo = { text: string; lat?: number; lng?: number };

type Suggestion = {
  description: string;
  placeId: string;
};

const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// ---------------- Helpers για το νέο Places Autocomplete (HTTP API) --------------
async function fetchSuggestions(input: string): Promise<Suggestion[]> {
  if (!GOOGLE_API_KEY || !input.trim()) return [];

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        // ζητάμε μόνο αυτά που χρειαζόμαστε
        "X-Goog-FieldMask":
          "suggestions.placePrediction.text,suggestions.placePrediction.placeId",
      },
      body: JSON.stringify({
        input,
        languageCode: "el",
        // bias γύρω από Αθήνα (προαιρετικό)
        locationBias: {
          circle: {
            center: { latitude: 37.9838, longitude: 23.7275 },
            radius: 50000,
          },
        },
      }),
    });

    if (!res.ok) {
      console.error("Autocomplete HTTP error:", res.status, await res.text());
      return [];
    }

    const data = await res.json();

    const suggestions: Suggestion[] =
      data.suggestions?.map((s: any) => ({
        description: s.placePrediction?.text?.text ?? "",
        placeId: s.placePrediction?.placeId ?? "",
      })) ?? [];

    return suggestions.filter((s) => s.description && s.placeId);
  } catch (err) {
    console.error("Autocomplete fetch error:", err);
    return [];
  }
}

// Place Details για να πάρουμε lat/lng + κανονική διεύθυνση
async function fetchPlaceDetails(placeId: string): Promise<PlaceInfo> {
  if (!GOOGLE_API_KEY || !placeId) return { text: "" };

  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${encodeURIComponent(placeId)}` +
    "&fields=geometry,formatted_address,name" +
    `&language=el&key=${encodeURIComponent(GOOGLE_API_KEY)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Place Details HTTP error:", res.status, await res.text());
      return { text: "" };
    }
    const data = await res.json();
    const result = data.result;

    const loc = result?.geometry?.location;
    const text = result?.formatted_address || result?.name || "";

    return {
      text,
      lat: loc?.lat,
      lng: loc?.lng,
    };
  } catch (err) {
    console.error("Place details fetch error:", err);
    return { text: "" };
  }
}

// --------- options για ώρα (24ωρο, ανά 30 λεπτά) ----------
const TIME_OPTIONS: { value: string; label: string }[] = Array.from(
  { length: 24 * 2 },
  (_, i) => {
    const totalMinutes = i * 30;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const value = `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}`;
    return { value, label: value };
  }
);

// --------- helper για public token ----------
function generatePublicToken(length = 32): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const array = new Uint32Array(length);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
  } else {
    // fallback
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}

// ---------------- Κύρια σελίδα ----------------
export default function HomePage() {
  const pickupRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);

  const [pickup, setPickup] = useState<PlaceInfo>({ text: "" });
  const [destination, setDestination] = useState<PlaceInfo>({ text: "" });

  const [pickupInput, setPickupInput] = useState("");
  const [destInput, setDestInput] = useState("");

  const [pickupSuggestions, setPickupSuggestions] = useState<Suggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<Suggestion[]>([]);

  const pickupDebounce = useRef<number | null>(null);
  const destDebounce = useRef<number | null>(null);

  // active index για keyboard navigation
  const [pickupActiveIndex, setPickupActiveIndex] = useState<number>(-1);
  const [destActiveIndex, setDestActiveIndex] = useState<number>(-1);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  // --------------- Geocoding fallback ---------------
  const geocodeText = async (
    text: string
  ): Promise<{ lat?: number; lng?: number; formatted?: string }> => {
    // @ts-ignore
    const g = (window as any).google as any;
    if (!g?.maps?.Geocoder) return {};
    return await new Promise((resolve) => {
      const geocoder = new g.maps.Geocoder();
      geocoder.geocode({ address: text }, (results: any, status: any) => {
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry?.location;
          resolve({
            lat: loc?.lat?.(),
            lng: loc?.lng?.(),
            formatted: results[0].formatted_address,
          });
        } else {
          resolve({});
        }
      });
    });
  };

  // --------------- Τρέχουσα θέση ---------------
  const useCurrentLocation = () => {
    // @ts-ignore
    const g = (window as any).google as any;

    setErrorMsg(null);
    setLocating(true);

    if (!navigator.geolocation) {
      setLocating(false);
      setErrorMsg("Ο browser δεν υποστηρίζει γεωεντοπισμό.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (g?.maps?.Geocoder) {
          const geocoder = new g.maps.Geocoder();
          geocoder.geocode(
            { location: { lat, lng } },
            (results: any, status: any) => {
              let text: string;

              if (status === "OK" && results?.length) {
                // Προσπαθούμε να αποφύγουμε plus-codes (διευθύνσεις με '+')
                const niceResult =
                  results.find(
                    (r: any) =>
                      r.formatted_address &&
                      !String(r.formatted_address).includes("+")
                  ) || results[0];

                text =
                  niceResult?.formatted_address ||
                  `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              } else {
                text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              }

              if (pickupRef.current) pickupRef.current.value = text;
              setPickupInput(text);
              setPickup({ text, lat, lng });
              setLocating(false);
            }
          );
        } else {
          const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          if (pickupRef.current) pickupRef.current.value = text;
          setPickupInput(text);
          setPickup({ text, lat, lng });
          setLocating(false);
        }
      },
      (err) => {
        console.error(err);
        setErrorMsg(
          "Αδυναμία λήψης τρέχουσας θέσης. Έλεγξε τα δικαιώματα τοποθεσίας."
        );
        setLocating(false);
      }
    );
  };

  // --------------- Handlers για τα inputs + autocomplete ---------------
  const triggerPickupAutocomplete = (value: string) => {
    if (pickupDebounce.current) {
      window.clearTimeout(pickupDebounce.current);
    }
    if (value.trim().length < 3) {
      setPickupSuggestions([]);
      setPickupActiveIndex(-1);
      return;
    }
    pickupDebounce.current = window.setTimeout(async () => {
      const results = await fetchSuggestions(value);
      setPickupSuggestions(results);
      setPickupActiveIndex(results.length > 0 ? 0 : -1);
    }, 300);
  };

  const triggerDestAutocomplete = (value: string) => {
    if (destDebounce.current) {
      window.clearTimeout(destDebounce.current);
    }
    if (value.trim().length < 3) {
      setDestSuggestions([]);
      setDestActiveIndex(-1);
      return;
    }
    destDebounce.current = window.setTimeout(async () => {
      const results = await fetchSuggestions(value);
      setDestSuggestions(results);
      setDestActiveIndex(results.length > 0 ? 0 : -1);
    }, 300);
  };

  const handlePickupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPickupInput(value);
    setPickup((prev) => ({ ...prev, text: value, lat: undefined, lng: undefined }));
    triggerPickupAutocomplete(value);
  };

  const handleDestChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDestInput(value);
    setDestination((prev) => ({ ...prev, text: value, lat: undefined, lng: undefined }));
    triggerDestAutocomplete(value);
  };

  const selectPickupSuggestion = async (s: Suggestion) => {
    setPickupSuggestions([]);
    setPickupActiveIndex(-1);
    const details = await fetchPlaceDetails(s.placeId);
    const text = details.text || s.description;
    setPickup({
      text,
      lat: details.lat,
      lng: details.lng,
    });
    setPickupInput(text);
    if (pickupRef.current) pickupRef.current.value = text;
  };

  const selectDestSuggestion = async (s: Suggestion) => {
    setDestSuggestions([]);
    setDestActiveIndex(-1);
    const details = await fetchPlaceDetails(s.placeId);
    const text = details.text || s.description;
    setDestination({
      text,
      lat: details.lat,
      lng: details.lng,
    });
    setDestInput(text);
    if (destRef.current) destRef.current.value = text;
  };

  // keyboard handlers για autocomplete
  const handlePickupKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!pickupSuggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPickupActiveIndex((prev) =>
        prev < pickupSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPickupActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter" && pickupActiveIndex >= 0) {
      e.preventDefault();
      const s = pickupSuggestions[pickupActiveIndex];
      if (s) selectPickupSuggestion(s);
    } else if (e.key === "Escape") {
      setPickupSuggestions([]);
      setPickupActiveIndex(-1);
    }
  };

  const handleDestKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!destSuggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestActiveIndex((prev) =>
        prev < destSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter" && destActiveIndex >= 0) {
      e.preventDefault();
      const s = destSuggestions[destActiveIndex];
      if (s) selectDestSuggestion(s);
    } else if (e.key === "Escape") {
      setDestSuggestions([]);
      setDestActiveIndex(-1);
    }
  };

  // --------------- Submit ---------------
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const form = e.currentTarget;
      const fd = new FormData(form);

      const pickupText = pickupInput.trim();
      const destText = destInput.trim();
      const date = ((fd.get("date") as string) || "").trim();
      const timeFrom = ((fd.get("timeFrom") as string) || "").trim();
      const timeTo = ((fd.get("timeTo") as string) || "").trim();
      const ambulanceType = ((fd.get("ambulanceType") as string) || "").trim();
      const isEmergency = fd.get("isEmergency") === "on";

      const email = ((fd.get("email") as string) || "").trim();
      const fullName = ((fd.get("fullName") as string) || "").trim();
      const phone = ((fd.get("phone") as string) || "").trim();

      const comments = ((fd.get("comments") as string) || "").trim();

      if (!pickupText || !destText || !date || !ambulanceType || !email) {
        setErrorMsg(
          "Συμπλήρωσε παραλαβή, προορισμό, ημερομηνία, είδος ασθενοφόρου και email."
        );
        setSubmitting(false);
        return;
      }

      let pLat = pickup.lat,
        pLng = pickup.lng,
        dLat = destination.lat,
        dLng = destination.lng;

      // Αν δεν έχουμε coords από autocomplete, κάνουμε geocode
      if (pLat == null || pLng == null) {
        const r = await geocodeText(pickupText);
        if (r.lat != null && r.lng != null) {
          pLat = r.lat;
          pLng = r.lng;
        }
      }
      if (dLat == null || dLng == null) {
        const r = await geocodeText(destText);
        if (r.lat != null && r.lng != null) {
          dLat = r.lat;
          dLng = r.lng;
        }
      }

      await ensureAnonAuth();

      // Δημιουργούμε μοναδικό public token για τον πελάτη
      const publicToken = generatePublicToken(32);

      await addDoc(collection(db, "requests"), {
        pickupText,
        pickupLat: pLat ?? null,
        pickupLng: pLng ?? null,
        destText,
        destLat: dLat ?? null,
        destLng: dLng ?? null,
        date,
        timeFrom: timeFrom || null,
        timeTo: timeTo || null,
        ambulanceType,
        isEmergency,
        email,
        fullName: fullName || null,
        phone: phone || null,
        comments,
        createdAt: serverTimestamp(),
        status: "pending",
        source: "ambugo-web",
        publicToken,
      });

      // 🔔 ΚΑΛΕΙ το API route για να φύγουν τα emails (μαζι και το publicToken)
      try {
        await fetch("/api/notify-new-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickupText,
            destText,
            date,
            timeFrom: timeFrom || null,
            timeTo: timeTo || null,
            ambulanceType,
            isEmergency,
            email,
            fullName: fullName || null,
            phone: phone || null,
            comments,
            publicToken,
          }),
        });
      } catch (err) {
        console.error("Failed to call /api/notify-new-request", err);
        // Δεν σπάμε τη ροή του χρήστη αν κολλήσει το email
      }

      setErrorMsg(null);
      setSuccessMsg("✅ Το αίτημα καταχωρήθηκε! Θα λάβεις σύντομα προσφορές.");
      form.reset();
      setPickup({ text: "" });
      setDestination({ text: "" });
      setPickupInput("");
      setDestInput("");
    } catch (err) {
      console.error(err);
      setSuccessMsg(null);
      setErrorMsg("❌ Παρουσιάστηκε σφάλμα κατά την αποστολή. Δοκίμασε ξανά.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Χρειαζόμαστε ακόμα το Maps JS για Geocoder + geolocation */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`}
        strategy="afterInteractive"
      />

      <section className="container py-10">
        <h2 className="text-xl md:text-2xl font-semibold text-black mb-6">
          Φόρμα Αίτησης Ασθενοφόρου
        </h2>

        <form
          onSubmit={onSubmit}
          className="grid gap-4 max-w-2xl card p-6"
          autoComplete="on"
        >
          {/* ΠΑΡΑΛΑΒΗ */}
          <label className="grid gap-1">
            <span className="label">Διεύθυνση παραλαβής *</span>
            <div className="relative flex flex-col gap-1 w-full">
              <div className="flex gap-2">
                <input
                  ref={pickupRef}
                  name="pickup"
                  required
                  placeholder="π.χ. Ευαγγελισμός, Αθήνα"
                  className="input flex-1"
                  autoComplete="off"
                  inputMode="text"
                  value={pickupInput}
                  onChange={handlePickupChange}
                  onKeyDown={handlePickupKeyDown}
                  onBlur={() => {
                    // μικρή καθυστέρηση για να προλάβει το click στο suggestion
                    setTimeout(() => setPickupSuggestions([]), 200);
                  }}
                />
                <button
                  type="button"
                  className="btn disabled:opacity-60 whitespace-nowrap"
                  onClick={useCurrentLocation}
                  title="Χρήση τρέχουσας θέσης"
                  disabled={locating}
                >
                  {locating ? "Εντοπισμός..." : "Τρέχουσα θέση"}
                </button>
              </div>

              {pickupSuggestions.length > 0 && (
                <ul className="absolute z-20 top-full left-0 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white text-sm shadow">
                  {pickupSuggestions.map((s, index) => (
                    <li
                      key={s.placeId}
                      className={`cursor-pointer px-3 py-2 hover:bg-gray-100 ${
                        index === pickupActiveIndex ? "bg-gray-100" : ""
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectPickupSuggestion(s);
                      }}
                    >
                      {s.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </label>

          {/* ΠΡΟΟΡΙΣΜΟΣ */}
          <label className="grid gap-1">
            <span className="label">Διεύθυνση προορισμού *</span>
            <div className="relative w-full">
              <input
                ref={destRef}
                name="destination"
                required
                placeholder="π.χ. Ιατρικό Κέντρο, Μαρούσι"
                className="input w-full"
                autoComplete="off"
                inputMode="text"
                value={destInput}
                onChange={handleDestChange}
                onKeyDown={handleDestKeyDown}
                onBlur={() => {
                  setTimeout(() => setDestSuggestions([]), 200);
                }}
              />

              {destSuggestions.length > 0 && (
                <ul className="absolute z-20 top-full left-0 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white text-sm shadow">
                  {destSuggestions.map((s, index) => (
                    <li
                      key={s.placeId}
                      className={`cursor-pointer px-3 py-2 hover:bg-gray-100 ${
                        index === destActiveIndex ? "bg-gray-100" : ""
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectDestSuggestion(s);
                      }}
                    >
                      {s.description}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </label>

          {/* ΗΜΕΡΟΜΗΝΙΑ */}
          <label className="grid gap-1">
            <span className="label">Ημερομηνία *</span>
            <input type="date" name="date" required className="input" min={today} />
          </label>

          {/* Ώρα παραλαβής (από / έως) – dropdown 24ωρο */}
          <label className="grid gap-1">
            <span className="label flex items-center justify-between">
              <span>Ώρα παραλαβής</span>
              <span className="text-xs text-gray-500">(προαιρετική)</span>
            </span>
            <div className="flex gap-2">
              <select name="timeFrom" className="input">
                <option value="">--:--</option>
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select name="timeTo" className="input">
                <option value="">--:--</option>
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {/* Είδος ασθενοφόρου */}
          <label className="grid gap-1">
            <span className="label">Είδος ασθενοφόρου *</span>
            <select
              name="ambulanceType"
              required
              className="input"
              defaultValue=""
            >
              <option value="" disabled>
                Επιλέξτε είδος ασθενοφόρου
              </option>
              <option value="basic">Απλό ασθενοφόρο (μεταφορά ασθενούς)</option>
              <option value="doctor">Ασθενοφόρο με συνοδεία ιατρού</option>
              <option value="icu">Μονάδα εντατικής θεραπείας (ΜΕΘ)</option>
              <option value="unknown">
                Δεν είμαι σίγουρος – να προτείνει η εταιρεία
              </option>
            </select>
          </label>

          {/* Επείγον περιστατικό */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="isEmergency"
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-800">
              Επείγον περιστατικό (άμεση παραλαβή)
            </span>
          </label>

          {/* Email */}
          <label className="grid gap-1">
            <span className="label">Email *</span>
            <input
              type="email"
              name="email"
              required
              placeholder="π.χ. onoma@example.com"
              className="input"
              autoComplete="email"
            />
          </label>

          {/* Ονοματεπώνυμο */}
          <label className="grid gap-1">
            <span className="label">Ονοματεπώνυμο</span>
            <input
              type="text"
              name="fullName"
              placeholder="π.χ. Γιώργος Παπαδόπουλος"
              className="input"
              autoComplete="name"
            />
          </label>

          {/* Κινητό τηλέφωνο */}
          <label className="grid gap-1">
            <span className="label">Κινητό τηλέφωνο</span>
            <input
              type="tel"
              name="phone"
              placeholder="π.χ. 6941234567"
              className="input"
              autoComplete="tel"
            />
          </label>

          {/* ΣΧΟΛΙΑ */}
          <label className="grid gap-1">
            <span className="label">Σχόλια</span>
            <textarea
              name="comments"
              rows={3}
              placeholder="Οδηγίες, όροφος, ανάγκες υποστήριξης κ.λπ."
              className="input"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="btn disabled:opacity-60"
          >
            {submitting ? "Αποστολή..." : "Θέλω Προσφορά"}
          </button>

          {successMsg && (
            <div className="text-sm text-green-600">{successMsg}</div>
          )}
          {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
        </form>
      </section>
    </>
  );
}
