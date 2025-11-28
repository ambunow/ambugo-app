// src/app/api/send-request-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL =
  process.env.REQUESTS_FROM_EMAIL || "Ambugo <no-reply@ambugo.app>";

const AMBULANCE_RECIPIENTS = (process.env.AMBULANCE_RECIPIENTS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

const ambulanceTypeLabel: Record<string, string> = {
  basic: "Απλό ασθενοφόρο (μεταφορά ασθενούς)",
  doctor: "Ασθενοφόρο με συνοδεία ιατρού",
  icu: "Μονάδα εντατικής θεραπείας (ΜΕΘ)",
  unknown: "Δεν είμαι σίγουρος – να προτείνει η εταιρεία",
};

export async function POST(req: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing RESEND_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json();

    const {
      requestId,
      pickupText,
      destText,
      date,
      timeFrom,
      timeTo,
      ambulanceType,
      isEmergency,
      email,
      fullName,
      phone,
      comments,
    } = body || {};

    if (!pickupText || !destText || !date) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const ambulanceTypeText =
      (ambulanceType && ambulanceTypeLabel[ambulanceType]) || "-";

    const timeRange =
      timeFrom || timeTo
        ? `${timeFrom || "--:--"} – ${timeTo || "--:--"}`
        : "Όλη την ημέρα";

    const subject = `Νέο αίτημα ασθενοφόρου${
      isEmergency ? " (ΕΠΕΙΓΟΝ)" : ""
    } – ${date}`;

    const htmlForProviders = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:14px; color:#111">
        <h2>Νέο αίτημα ασθενοφόρου ${isEmergency ? " (ΕΠΕΙΓΟΝ)" : ""}</h2>
        <p><strong>ID αιτήματος:</strong> ${requestId ?? "-"}</p>
        <p><strong>Ημερομηνία μεταφοράς:</strong> ${date}</p>
        <p><strong>Ώρα παραλαβής:</strong> ${timeRange}</p>
        <p><strong>Είδος ασθενοφόρου:</strong> ${ambulanceTypeText}</p>
        <p><strong>Επείγον:</strong> ${isEmergency ? "Ναι" : "Όχι"}</p>

        <p><strong>Από:</strong><br/>${pickupText}</p>
        <p><strong>Προς:</strong><br/>${destText}</p>

        <hr style="margin:16px 0; border:none; border-top:1px solid #eee;" />

        <p><strong>Στοιχεία πελάτη</strong></p>
        <p><strong>Ονοματεπώνυμο:</strong> ${fullName || "-"}</p>
        <p><strong>Email:</strong> ${email || "-"}</p>
        <p><strong>Κινητό:</strong> ${phone || "-"}</p>

        <p><strong>Σχόλια πελάτη:</strong><br/>${comments || "-"}</p>

        <hr style="margin:16px 0; border:none; border-top:1px solid #eee;" />
        <p style="font-size:12px; color:#666">
          Το μήνυμα δημιουργήθηκε αυτόματα από την πλατφόρμα Ambugo.
        </p>
      </div>
    `;

    const toProviders =
      AMBULANCE_RECIPIENTS.length > 0
        ? AMBULANCE_RECIPIENTS
        : [FROM_EMAIL]; // fallback για δοκιμές

    // 1) Email προς εταιρείες ασθενοφόρων
    await resend.emails.send({
      from: FROM_EMAIL,
      to: toProviders,
      subject,
      html: htmlForProviders,
    });

    // 2) Επιβεβαίωση προς πελάτη (αν έδωσε email)
    if (email) {
      const htmlForCustomer = `
        <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size:14px; color:#111">
          <h2>Επιβεβαίωση αίτησης ασθενοφόρου</h2>
          <p>Αγαπητέ/ή ${fullName || "πελάτη"},</p>
          <p>Λάβαμε την αίτησή σας για ασθενοφόρο. Σύντομα θα λάβετε προσφορές από συνεργαζόμενες εταιρείες.</p>

          <p><strong>Ημερομηνία μεταφοράς:</strong> ${date}</p>
          <p><strong>Ώρα παραλαβής:</strong> ${timeRange}</p>
          <p><strong>Είδος ασθενοφόρου:</strong> ${ambulanceTypeText}</p>
          <p><strong>Επείγον:</strong> ${isEmergency ? "Ναι" : "Όχι"}</p>

          <p><strong>Από:</strong><br/>${pickupText}</p>
          <p><strong>Προς:</strong><br/>${destText}</p>

          <p><strong>Σχόλια που δώσατε:</strong><br/>${comments || "-"}</p>

          <p style="margin-top:16px; font-size:12px; color:#666">
            Το email είναι ενημερωτικό, μην το απαντήσετε. Αν υπάρχει κάτι επείγον, επικοινωνήστε απευθείας με το 166/112.
          </p>
        </div>
      `;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        subject: "Λάβαμε την αίτησή σας για ασθενοφόρο",
        html: htmlForCustomer,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-request-email error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
