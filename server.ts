import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory leads storage for backup / immediate access
const leads: Array<{
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  services: string;
  budget: string;
  message: string;
  createdAt: string;
}> = [];

// API Route for project inquiries / contact form
app.post("/api/start-project", async (req, res) => {
  try {
    const { name, email, phone, company, services, budget, message } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: "Name, email, and phone number are required." });
    }

    const lead = {
      id: Date.now().toString(),
      name,
      email,
      phone,
      company: company || "N/A",
      services: Array.isArray(services) ? services.join(", ") : services || "Not specified",
      budget: budget || "Not specified",
      message: message || "No additional message",
      createdAt: new Date().toISOString(),
    };

    leads.push(lead);
    console.log("📬 NEW PROJECT INQUIRY RECEIVED:", lead);

    const ownerEmail = process.env.OWNER_EMAIL || "contact.ssailabs@gmail.com";

    let emailSent = false;

    // Check if SMTP credentials exist
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: process.env.SMTP_PORT === "465",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: `"S.S AI LABS Website" <${process.env.SMTP_USER}>`,
          to: ownerEmail,
          replyTo: email,
          subject: `🚀 New Project Request from ${name} (${company || "Individual"})`,
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 24px; background: #0f1117; color: #e2e8f0; border-radius: 12px; max-width: 600px; margin: 0 auto;">
              <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 16px; margin-bottom: 20px;">
                <h1 style="color: #60a5fa; font-size: 22px; margin: 0;">S.S AI LABS</h1>
                <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">New Project Details Inquiry</p>
              </div>
              
              <div style="background: #1e293b; padding: 18px; border-radius: 8px; margin-bottom: 16px;">
                <h3 style="color: #f8fafc; font-size: 16px; margin-top: 0; border-bottom: 1px solid #334155; padding-bottom: 8px;">Client Information</h3>
                <p style="margin: 8px 0; font-size: 14px;"><strong>Full Name:</strong> <span style="color: #38bdf8;">${name}</span></p>
                <p style="margin: 8px 0; font-size: 14px;"><strong>Email:</strong> <a href="mailto:${email}" style="color: #60a5fa;">${email}</a></p>
                <p style="margin: 8px 0; font-size: 14px;"><strong>Phone / WhatsApp:</strong> <a href="tel:${phone}" style="color: #60a5fa;">${phone}</a></p>
                <p style="margin: 8px 0; font-size: 14px;"><strong>Company / Business:</strong> ${company || "N/A"}</p>
              </div>

              <div style="background: #1e293b; padding: 18px; border-radius: 8px; margin-bottom: 16px;">
                <h3 style="color: #f8fafc; font-size: 16px; margin-top: 0; border-bottom: 1px solid #334155; padding-bottom: 8px;">Project Scope</h3>
                <p style="margin: 8px 0; font-size: 14px;"><strong>Requested Services:</strong> <span style="color: #4ade80;">${lead.services}</span></p>
                <p style="margin: 8px 0; font-size: 14px;"><strong>Estimated Budget:</strong> <span style="color: #fbbf24;">${lead.budget}</span></p>
              </div>

              <div style="background: #1e293b; padding: 18px; border-radius: 8px; border-left: 4px solid #60a5fa;">
                <h3 style="color: #f8fafc; font-size: 16px; margin-top: 0;">Project Details & Message</h3>
                <p style="color: #e2e8f0; font-size: 14px; white-space: pre-wrap; margin-bottom: 0;">${message || "No additional message provided."}</p>
              </div>

              <div style="margin-top: 24px; text-align: center; font-size: 12px; color: #64748b;">
                Received on ${new Date().toLocaleString()} via S.S AI LABS Contact Form
              </div>
            </div>
          `,
        });
        emailSent = true;
      } catch (err: any) {
        console.error("Failed to send SMTP email:", err);
      }
    }

    return res.json({
      success: true,
      message: "Project inquiry received successfully!",
      emailSent,
      lead,
    });
  } catch (error: any) {
    console.error("Error processing project inquiry:", error);
    return res.status(500).json({ error: "Server error handling project submission." });
  }
});

// Endpoint to view leads (for owner reference)
app.get("/api/leads", (_req, res) => {
  res.json({ count: leads.length, leads });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
