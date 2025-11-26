"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, ensureAnonAuth } from "@/lib/firebase";

type PlaceInfo = { text: string; lat?: number; lng?: number };

export default function HomePage() {
  const pickupRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);

  const [pickup, setPickup] = useState<PlaceInfo>({ text: "" });
  const [destination, setDestination] = useState<PlaceInfo>({ text: "" });

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false); // <— νέο state για τρέχουσα θέση

  const today = new Date().toISOString().split("T")[0];

  // ---------------- Google Places init ----------------
  const initPlaces = () => {
    // @ts-ignore
    const g = (window as any).google as any;
    if (!g || !pickupRef.current || !destRef.current) return;

    const opts = {
      // ζητάμε address + geometry + όνομα + place_id
      fields: ["formatted_address", "geometry", "name", "place_id"],
      componentRestrictions: { country: ["gr", "cy"] },
      // ΚΑΙ διευθύνσεις (geocode) ΚΑΙ σημεία ενδιαφέροντος (establishment)
      types: ["geocode", "establishment"],
    };

    const acPickup = new g.maps.places.Autocomplete(pickupRef.current, opts);
    const acDest = new g.maps.places.Autocomplete(destRef.current, opts);

    acPickup.addListener("place_changed", () => {
      const place = acPickup.getPlace();
      const lat = place?.geometry?.location?.lat?.();
      const lng = place?.geometry?.location?.lng?.();
      const text =
        place?.formatted_address || place?.name || pickupRef.current!.value || "";
      pickupRef.current!.value = text;
      setPickup({ text, lat, lng });
    });

    acDest.addListener("place_changed", () => {
      const place = acDest.getPlace();
      const lat = place?.geometry?.location?.lat?.();
      const lng = place?.geometry?.location?.lng?.();
      const text =
        place?.formatted_address || place?.name || destRef.current!.value || "";
      destRef.current!.value = text;
      setDestination({ text, lat, lng });
    });
  };

  // --------------- Helpers ---------------
  // Αν δεν έχουμε lat/lng, προσπαθούμε με Geocoding API
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

  const useCurrentLocation = () => {
    // @ts-ignore
    const g = (window as any).google as any;

    setErrorMsg(null); // καθαρίζουμε παλιά σφάλματα
    setLocating(true); // ξεκινά ο εντοπισμός

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
              const text =
                status === "OK" && results?.[0]?.formatted_address
                  ? results[0].formatted_address
                  : `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              if (pickupRef.current) pickupRef.current.value = text;
              setPickup({ text, lat, lng });
              setLocating(false);
            }
          );
        } else {
          const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          if (pickupRef.current) pickupRef.current.value = text;
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

  // --------------- Submit ---------------
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const form = e.currentTarget;
      const fd = new FormData(form);

      const pickupText = ((fd.get("pickup") as string) || "").trim();
      const destText = ((fd.get("destination") as string) || "").trim();
      const date = ((fd.get("date") as string) || "").trim();
      const comments = ((fd.get("comments") as string) || "").trim();

      if (!pickupText || !destText || !date) {
        setErrorMsg("Συμπλήρωσε παραλαβή, προορισμό και ημερομηνία.");
        setSubmitting(false);
        return;
      }

      // Αν δεν έχουμε συντεταγμένες από το Autocomplete, κάνε geocoding
      let pLat = pickup.lat,
        pLng = pickup.lng,
        dLat = destination.lat,
        dLng = destination.lng;

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

      await addDoc(collection(db, "requests"), {
        pickupText,
        pickupLat: pLat ?? null,
        pickupLng: pLng ?? null,
        destText,
        destLat: dLat ?? null,
        destLng: dLng ?? null,
        date,
        comments,
        createdAt: serverTimestamp(),
        status: "pending",
        source: "ambugo-web",
      });

      setErrorMsg(null);
      setSuccessMsg("✅ Το αίτημα καταχωρήθηκε! Θα λάβεις σύντομα προσφορές.");
      form.reset();
      setPickup({ text: "" });
      setDestination({ text: "" });
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
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={initPlaces}
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
          <label className="grid gap-1">
            <span className="label">Διεύθυνση παραλαβής *</span>
            <div className="flex gap-2">
              <input
                ref={pickupRef}
                name="pickup"
                required
                placeholder="π.χ. Ευαγγελισμός, Αθήνα"
                className="input flex-1"
                defaultValue=""
                autoComplete="street-address"
                inputMode="text"
              />
              <button
                type="button"
                className="btn disabled:opacity-60"
                onClick={useCurrentLocation}
                title="Χρήση τρέχουσας θέσης"
                disabled={locating}
              >
                {locating ? "Εντοπισμός..." : "Τρέχουσα θέση"}
              </button>
            </div>
          </label>

          <label className="grid gap-1">
            <span className="label">Διεύθυνση προορισμού *</span>
            <input
              ref={destRef}
              name="destination"
              required
              placeholder="π.χ. Ιατρικό Κέντρο, Μαρούσι"
              className="input"
              defaultValue=""
              autoComplete="street-address"
              inputMode="text"
            />
          </label>

          <label className="grid gap-1">
            <span className="label">Ημερομηνία *</span>
            <input type="date" name="date" required className="input" min={today} />
          </label>

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
