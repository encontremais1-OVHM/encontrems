import { CheckCircle2, ExternalLink, FileUp, Loader2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/client";
import { uploadPaymentProof } from "@/lib/api/endpoints";
import type { RegistrationPayment } from "@/lib/api/types";
import { formatDate, formatKz } from "@/lib/format";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * Shows what the backend says about paying: amount, instructions, an optional
 * gateway checkout and, when enabled, a proof upload for manual validation.
 * Nothing here marks a payment as done — only the backend confirms payments.
 */
export function PaymentPanel({
  payment,
  registrationReference,
  whatsapp,
  onProofSent,
}: {
  payment: RegistrationPayment;
  registrationReference: string;
  whatsapp: string;
  onProofSent?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(Boolean(payment.proof_submitted_at));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Escolha o ficheiro do comprovativo.");
    if (!ACCEPTED.includes(file.type)) return setError("Formato não suportado. Use JPG, PNG, WEBP ou PDF.");
    if (file.size > MAX_PROOF_BYTES) return setError("O ficheiro não pode ter mais de 5 MB.");
    setSending(true);
    try {
      await uploadPaymentProof(registrationReference, whatsapp, file);
      setSent(true);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onProofSent?.();
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{payment.amount_kz === 0 ? "Adesão gratuita" : "Renovação da comunidade"}</p>
          <p className="mt-1 font-display text-3xl font-black tabular text-foreground">{payment.amount_kz === 0 ? "0 Kz" : formatKz(payment.amount_kz)}</p>
        </div>
        <p className="rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          Referência: <span className="font-mono font-semibold text-foreground">{payment.reference}</span>
        </p>
      </div>

      {payment.status === "confirmed" && payment.amount_kz > 0 && (
        <p className="mt-4 text-sm text-success">Pagamento confirmado. A renovação foi aprovada e o acesso foi prolongado.</p>
      )}
      {payment.status === "pending" && payment.amount_kz > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Pagamento pendente. O acesso só será prolongado depois da confirmação automática da Kursinha.</p>
      )}
      {payment.status === "cancelled" && (
        <p className="mt-4 text-sm text-destructive">Este pagamento foi cancelado. Pode tentar novamente através do link de pagamento.</p>
      )}
      {payment.status === "rejected" && (
        <p className="mt-4 text-sm text-destructive">O pagamento não foi confirmado. Contacte a equipa Encontre + se precisar de ajuda.</p>
      )}

      {payment.checkout_url && (
        <Button asChild className="mt-5 w-full sm:w-auto">
          <a href={payment.checkout_url} target="_blank" rel="noopener noreferrer">
            Pagar agora <ExternalLink />
          </a>
        </Button>
      )}

      {payment.instructions.length > 0 && (
        <div className="mt-5 space-y-3">
          {payment.instructions.map((ins) => (
            <div key={ins.method} className="rounded-xl border p-4">
              <p className="text-sm font-bold text-foreground">{ins.label}</p>
              <ul className="mt-1.5 space-y-0.5">
                {ins.details.map((line, i) => (
                  <li key={i} className="font-mono text-xs text-muted-foreground sm:text-sm">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Indique sempre a referência no pagamento. A confirmação é feita pela equipa ou automaticamente pelo
            meio de pagamento.
          </p>
        </div>
      )}

      {payment.amount_kz === 0 ? (
        <p className="mt-4 text-sm text-success">A entrada na comunidade é gratuita durante os primeiros 30 dias. A renovação custa 1.000 Kz.</p>
      ) : !payment.checkout_url && payment.instructions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">As instruções de pagamento serão enviadas pela equipa Encontre + para o seu WhatsApp.</p>
      ) : null}

      {payment.proof_upload_enabled && payment.status !== "confirmed" && (
        <div className="mt-6 border-t pt-5">
          {sent ? (
            <p className="flex items-start gap-2 text-sm text-success">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>
                Comprovativo recebido
                {payment.proof_submitted_at ? ` em ${formatDate(payment.proof_submitted_at, true)}` : ""}. Vai ser
                validado em breve.
              </span>
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <label htmlFor="proof" className="block text-sm font-semibold text-foreground">
                Já pagou? Envie o comprovativo
              </label>
              <input
                ref={fileRef}
                id="proof"
                type="file"
                accept={ACCEPTED.join(",")}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-accent-foreground hover:file:bg-accent/80"
              />
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button type="submit" variant="outline" disabled={sending || !file}>
                {sending ? <Loader2 className="animate-spin" /> : <FileUp />}
                Enviar comprovativo
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
