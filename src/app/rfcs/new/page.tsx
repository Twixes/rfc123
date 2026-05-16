import type { Metadata } from "next";
import { auth } from "@/auth";
import RFCNewClient from "./RFCNewClient";

export const metadata: Metadata = {
  title: "New RFC",
};

export default async function NewRFCPage() {
  const session = await auth();

  // Middleware handles auth redirect; safe to assume session exists here.
  return <RFCNewClient session={session} />;
}
