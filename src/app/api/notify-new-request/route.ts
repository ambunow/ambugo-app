import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const ambulanceTypeLabel: Record<string, string> = {
  basic: "Απλό ασθενοφόρο",
  doctor: "Με συνοδεία ιατρού",
  icu: "Μονάδα εντατικής θεραπείας (ΜΕΘ)",
  unknown: "Δεν είναι σίγουρος – να προτείνει η εταιρεία",
};

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const from = process.env.REQUESTS_FROM_EMAIL;
    const recipientsRaw = process.env.AMBULANCE_RECIPIENTS || "";

    if (!from || !process.env.RESEND_API_KEY || !recipientsRaw) {
      console.error("Missing email env vars");
      return NextResponse.json(
        { ok: false, error: "Email configuration missing" },
        { status: 500 }
      );
    }

    const to = recipientsRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!to.length) {
      console.error("No valid recipients in AMBULANCE_RECIPIENTS");
      return NextResponse.json(
        { ok: false, error: "No recipients configured" },
        { status: 500 }
      );
    }

    const {
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
    } = body as {
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
    };

    const subjectPrefix = isEmergency ? "⚠️ ΕΠΕΙΓΟΝ" : "Νέο αίτημα";
    const subject = `${subjectPrefix} ασθενοφόρου - ${date || ""}`.trim();

    const typeLabel =
      (ambulanceType && ambulanceTypeLabel[ambulanceType]) ||
      ambulanceType ||
      "-";

    const timeLabel =
      timeFrom || timeTo
        ? `${timeFrom || "--:--"} – ${timeTo || "--:--"}`
        : "Οποιαδήποτε ώρα μέσα στην ημέρα";

    const safeComments = (comments || "").replace(/\n/g, "<br />") || "-";

    // 1) Email προς εσένα / συνεργάτες
    await resend.emails.send({
      from,
      to,
      subject,
      html: `
        <h2>Νέο αίτημα ασθενοφόρου</h2>
        <p><strong>${isEmergency ? "ΕΠΕΙΓΟΝ περιστατικό" : "Συνήθες περιστατικό"}</strong></p>
        <p><strong>Ημερομηνία μεταφοράς:</strong> ${date || "-"}</p>
        <p><strong>Ώρα παραλαβής:</strong> ${timeLabel}</p>
        <p><strong>Είδος ασθενοφόρου:</strong> ${typeLabel}</p>
        <p><strong>Από:</strong> ${pickupText}</p>
        <p><strong>Προς:</strong> ${destText}</p>
        <p><strong>Πελάτης:</strong> ${fullName || "-"}</p>
        <p><strong>Email:</strong> ${email || "-"}</p>
        <p><strong>Τηλέφωνο:</strong> ${phone || "-"}</p>
        <p><strong>Σχόλια:</strong><br />${safeComments}</p>
      `,
      replyTo: email || undefined,
    });

    // 2) Email επιβεβαίωσης προς τον πελάτη (αν έχει δώσει email)
    if (email) {
      try {
        await resend.emails.send({
          from,
          to: [email],
          subject: "Λάβαμε το αίτημά σας για ασθενοφόρο",
          html: `
            <p>Αγαπητέ/ή ${fullName || "πελάτη"},</p>
            <p>
              Η πλατφόρμα <strong>Ambugo</strong> έλαβε το αίτημά σας για ασθενοφόρο
              και θα αναζητήσουμε διαθέσιμες εταιρείες για να σας στείλουν προσφορές.
            </p>
            <p><strong>Σύνοψη αιτήματος:</strong></p>
            <ul>
              <li><strong>Ημερομηνία μεταφοράς:</strong> ${date || "-"}</li>
              <li><strong>Ώρα παραλαβής:</strong> ${timeLabel}</li>
              <li><strong>Είδος ασθενοφόρου:</strong> ${typeLabel}</li>
              <li><strong>Από:</strong> ${pickupText}</li>
              <li><strong>Προς:</strong> ${destText}</li>
              <li><strong>Επείγον:</strong> ${
                isEmergency ? "Ναι (επείγον περιστατικό)" : "Όχι"
              }</li>
            </ul>
            <p>
              Μόλις υπάρχουν διαθέσιμες προσφορές, θα λάβετε ενημέρωση στο email σας.
            </p>
            <p style="font-size:12px;color:#666;">
              Αν το αίτημα δεν υποβλήθηκε από εσάς, μπορείτε απλώς να αγνοήσετε αυτό το μήνυμα.
            </p>
          `,
        });
      } catch (err) {
        // Δεν χαλάμε τη ροή αν αποτύχει η επιβεβαίωση προς τον πελάτη
        console.error("Failed to send confirmation email to customer", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error sending request email", err);
    return NextResponse.json(
      { ok: false, error: "Failed to send email" },
      { status: 500 }
    );
  }
}
