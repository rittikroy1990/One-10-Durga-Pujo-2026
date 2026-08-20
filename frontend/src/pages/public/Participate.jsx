import React, { useState } from "react";
import { toast } from "sonner";
import { HandHeart, Music, Loader2 } from "lucide-react";
import api from "../../lib/api";
import PublicLayout from "../../components/PublicLayout";
import { Button, Label, Input, Textarea, Select } from "../../components/ui";

export default function Participate() {
  const [kind, setKind] = useState("volunteer");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({
    name: "", mobile: "", skills: "", availability: "", act_title: "", category: "",
    participants: "", duration: "", technical_needs: "", is_minor: false, guardian_consent: false,
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/participate", { kind, ...f });
      setDone(true);
      toast.success("Thank you! The EOC coordinator will be in touch.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not submit.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <HandHeart className="mx-auto h-16 w-16 text-gold-400" />
          <h1 className="mt-4 font-display text-4xl text-ivory-100">You're in!</h1>
          <p className="mt-2 text-ivory-100/70">Thank you for offering to be part of Amader Pujo. A coordinator will reach out with the next steps.</p>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-5 py-14">
        <h1 className="font-display text-5xl text-ivory-100">Participate</h1>
        <p className="mt-2 text-ivory-100/70">Volunteer your time or register a cultural performance. This is a Pujo for everyone.</p>

        <div className="mt-6 inline-flex rounded-full border border-gold-500/30 bg-brown-700/50 p-1">
          <button onClick={() => setKind("volunteer")} data-testid="participate-volunteer-tab" className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${kind === "volunteer" ? "bg-vermilion-500 text-white" : "text-ivory-100/70"}`}><HandHeart className="h-4 w-4" /> Volunteer</button>
          <button onClick={() => setKind("performer")} data-testid="participate-performer-tab" className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${kind === "performer" ? "bg-vermilion-500 text-white" : "text-ivory-100/70"}`}><Music className="h-4 w-4" /> Performer</button>
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-gold-500/25 bg-ivory-200 p-6 text-brown-900 sm:grid-cols-2">
          <div>
            <Label required htmlFor="pn">Name</Label>
            <Input id="pn" data-testid="participate-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pm">Mobile</Label>
            <Input id="pm" data-testid="participate-mobile" value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" />
          </div>
          {kind === "volunteer" ? (
            <>
              <div className="sm:col-span-2"><Label htmlFor="sk">Skills</Label><Input id="sk" data-testid="participate-skills" value={f.skills} onChange={(e) => set("skills", e.target.value)} placeholder="e.g. first aid, sound, hospitality" /></div>
              <div className="sm:col-span-2"><Label htmlFor="av">Availability</Label><Input id="av" value={f.availability} onChange={(e) => set("availability", e.target.value)} placeholder="e.g. evenings, all 5 days" /></div>
            </>
          ) : (
            <>
              <div><Label htmlFor="at">Act title</Label><Input id="at" data-testid="participate-act" value={f.act_title} onChange={(e) => set("act_title", e.target.value)} /></div>
              <div><Label htmlFor="cat">Category</Label><Input id="cat" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="dance / music / recital" /></div>
              <div><Label htmlFor="pt">Participants</Label><Input id="pt" value={f.participants} onChange={(e) => set("participants", e.target.value)} /></div>
              <div><Label htmlFor="du">Duration</Label><Input id="du" value={f.duration} onChange={(e) => set("duration", e.target.value)} placeholder="e.g. 6 min" /></div>
              <div className="sm:col-span-2"><Label htmlFor="tn">Technical needs</Label><Textarea id="tn" value={f.technical_needs} onChange={(e) => set("technical_needs", e.target.value)} /></div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.is_minor} onChange={(e) => set("is_minor", e.target.checked)} /> A participant is a minor
              </label>
              {f.is_minor && (
                <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" data-testid="participate-guardian" checked={f.guardian_consent} onChange={(e) => set("guardian_consent", e.target.checked)} /> Guardian consent provided
                </label>
              )}
            </>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" className="w-full" data-testid="participate-submit-btn" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register interest"}
            </Button>
          </div>
        </form>
      </div>
    </PublicLayout>
  );
}
