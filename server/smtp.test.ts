import { describe, it, expect } from "vitest";
import nodemailer from "nodemailer";

describe("SMTP Connection", () => {
  it("should connect to SMTP server with configured credentials", async () => {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    expect(host).toBeTruthy();
    expect(user).toBeTruthy();
    expect(pass).toBeTruthy();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: true },
    });

    const result = await transporter.verify();
    expect(result).toBe(true);
  }, 15000);
});
