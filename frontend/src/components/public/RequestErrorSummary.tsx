// Lists what is still missing on the current wizard step (see
// lib/request-validation.ts). Renders nothing when the step is complete.
import { errorMessages, type RequestErrors } from '@/lib/request-validation';

export function RequestErrorSummary({ errors }: { errors: RequestErrors }) {
  const messages = errorMessages(errors);
  if (messages.length === 0) return null;
  return (
    <div
      role="alert"
      className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
    >
      <p className="mb-1 font-semibold">Complétez les champs suivants pour continuer :</p>
      <ul className="list-disc pl-5">
        {messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
