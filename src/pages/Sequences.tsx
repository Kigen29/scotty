import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, GripVertical, Mail, Clock, ArrowDown, Zap,
  ChevronDown, ChevronUp, Sparkles, Loader2, Wand2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SequenceStep {
  subject: string;
  body_prompt: string;
  delay_days: number;
  channel: "email" | "whatsapp";
}

interface Sequence {
  id?: string;
  name: string;
  steps: SequenceStep[];
  is_active: boolean;
}

const defaultStep: SequenceStep = {
  subject: "",
  body_prompt: "",
  delay_days: 3,
  channel: "email",
};

const Sequences = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sequences, setSequences] = useState<(Sequence & { id: string })[]>([]);
  const [editing, setEditing] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(0);

  // AI generation state
  const [showAiForm, setShowAiForm] = useState(false);
  const [aiGoal, setAiGoal] = useState("");
  const [aiStepCount, setAiStepCount] = useState("3");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [refiningStep, setRefiningStep] = useState<number | null>(null);

  useEffect(() => {
    if (user) fetchSequences();
  }, [user]);

  const fetchSequences = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("sequences")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      setSequences(
        data.map((s) => ({
          id: s.id,
          name: s.name,
          steps: (s.steps as any as SequenceStep[]) || [],
          is_active: s.is_active,
        }))
      );
    }
  };

  const saveSequence = async () => {
    if (!user || !editing) return;
    if (!editing.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        user_id: user.id,
        name: editing.name,
        steps: editing.steps as any,
        is_active: editing.is_active,
      };

      if (editing.id) {
        const { error } = await supabase.from("sequences").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sequences").insert(payload);
        if (error) throw error;
      }
      toast({ title: "Sequence saved" });
      setEditing(null);
      fetchSequences();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const deleteSequence = async (id: string) => {
    const { error } = await supabase.from("sequences").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sequence deleted" });
      fetchSequences();
    }
  };

  const addStep = () => {
    if (!editing) return;
    const newSteps = [...editing.steps, { ...defaultStep, delay_days: editing.steps.length === 0 ? 0 : 3 }];
    setEditing({ ...editing, steps: newSteps });
    setExpandedStep(newSteps.length - 1);
  };

  const updateStep = (index: number, field: keyof SequenceStep, value: any) => {
    if (!editing) return;
    const steps = editing.steps.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    setEditing({ ...editing, steps });
  };

  const removeStep = (index: number) => {
    if (!editing) return;
    setEditing({ ...editing, steps: editing.steps.filter((_, i) => i !== index) });
    setExpandedStep(null);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    if (!editing) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= editing.steps.length) return;
    const steps = [...editing.steps];
    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    setEditing({ ...editing, steps });
    setExpandedStep(newIndex);
  };

  const generateWithAi = async () => {
    if (!aiGoal.trim()) {
      toast({ title: "Please describe your outreach goal", variant: "destructive" });
      return;
    }
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-sequence-steps", {
        body: { goal: aiGoal, num_steps: parseInt(aiStepCount), mode: "generate" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data.result;
      if (result?.name && result?.steps) {
        setEditing({
          ...editing!,
          name: result.name,
          steps: result.steps.map((s: any, i: number) => ({
            subject: s.subject || "",
            body_prompt: s.body_prompt || "",
            delay_days: i === 0 ? 0 : (s.delay_days || 3),
            channel: s.channel || "email",
          })),
        });
        setShowAiForm(false);
        setAiGoal("");
        setExpandedStep(0);
        toast({ title: "Sequence generated!", description: `${result.steps.length} steps created by AI` });
      }
    } catch (error: any) {
      toast({ title: "AI generation failed", description: error.message, variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const refineStepWithAi = async (index: number) => {
    if (!editing) return;
    const step = editing.steps[index];
    if (!step.body_prompt.trim() && !step.subject.trim()) {
      toast({ title: "Add some content first", description: "Write a subject or prompt before refining", variant: "destructive" });
      return;
    }
    setRefiningStep(index);
    try {
      const { data, error } = await supabase.functions.invoke("generate-sequence-steps", {
        body: {
          mode: "refine",
          existing_step: { subject: step.subject, body_prompt: step.body_prompt },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data.result;
      if (result) {
        const steps = editing.steps.map((s, i) =>
          i === index
            ? { ...s, subject: result.subject || s.subject, body_prompt: result.body_prompt || s.body_prompt }
            : s
        );
        setEditing({ ...editing, steps });
        toast({ title: "Step improved by AI" });
      }
    } catch (error: any) {
      toast({ title: "AI refine failed", description: error.message, variant: "destructive" });
    } finally {
      setRefiningStep(null);
    }
  };

  // Builder view
  if (editing) {
    return (
      <div className="p-6 space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {editing.id ? "Edit Sequence" : "New Sequence"}
            </h1>
            <p className="text-sm text-muted-foreground">Define the email steps AI will send</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditing(null); setShowAiForm(false); }}>Cancel</Button>
            <Button size="sm" onClick={saveSequence} disabled={loading}>
              {loading ? "Saving..." : "Save Sequence"}
            </Button>
          </div>
        </div>

        {/* AI Generate Section */}
        <div>
            {!showAiForm ? (
              <Button
                variant="outline"
                className="w-full border-dashed border-primary/40 text-primary hover:bg-primary/5"
                onClick={() => setShowAiForm(true)}
              >
                <Wand2 className="h-4 w-4 mr-2" />
                Generate with AI
              </Button>
            ) : (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">AI Sequence Generator</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Describe your outreach goal</Label>
                    <Input
                      value={aiGoal}
                      onChange={(e) => setAiGoal(e.target.value)}
                      placeholder="e.g. Cold outreach to restaurants without websites, offering web design services"
                      className="h-9 text-xs"
                      disabled={aiGenerating}
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Number of steps</Label>
                      <Select value={aiStepCount} onValueChange={setAiStepCount} disabled={aiGenerating}>
                        <SelectTrigger className="w-20 h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2, 3, 4, 5].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={generateWithAi} disabled={aiGenerating} className="h-9">
                        {aiGenerating ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Generate
                          </>
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowAiForm(false)} disabled={aiGenerating} className="h-9">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Sequence Name</Label>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Cold Outreach - Restaurants"
              className="h-9"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch
              checked={editing.is_active}
              onCheckedChange={(c) => setEditing({ ...editing, is_active: c })}
            />
            <Label className="text-xs">Active</Label>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {editing.steps.map((step, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="flex items-center gap-2 py-1.5 pl-8">
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    Wait {step.delay_days} day{step.delay_days !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              <Card className={`border ${expandedStep === i ? "border-primary/50" : "border-border"}`}>
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {step.channel === "email" ? <Mail className="h-3 w-3 mr-1" /> : null}
                      Step {i + 1}
                    </Badge>
                    <span className="text-sm truncate text-muted-foreground">
                      {step.subject || "Untitled step"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); moveStep(i, -1); }} disabled={i === 0}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); moveStep(i, 1); }} disabled={i === editing.steps.length - 1}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); removeStep(i); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {expandedStep === i && (
                  <CardContent className="pt-0 space-y-3 border-t border-border">
                    {i > 0 && (
                      <div className="space-y-1.5 pt-3">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" /> Delay (days after previous step)
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={step.delay_days}
                          onChange={(e) => updateStep(i, "delay_days", parseInt(e.target.value) || 1)}
                          className="h-9 w-24"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Subject Line</Label>
                      <Input
                        value={step.subject}
                        onChange={(e) => updateStep(i, "subject", e.target.value)}
                        placeholder="e.g. Quick question about {{business_name}}"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">AI Prompt / Template</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-primary hover:text-primary"
                          onClick={() => refineStepWithAi(i)}
                          disabled={refiningStep === i}
                        >
                          {refiningStep === i ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3 mr-1" />
                          )}
                          {refiningStep === i ? "Improving..." : "AI Improve"}
                        </Button>
                      </div>
                      <Textarea
                        value={step.body_prompt}
                        onChange={(e) => updateStep(i, "body_prompt", e.target.value)}
                        placeholder="Describe what this email should say. AI will personalize it per lead. e.g. 'Introduce yourself, mention their business has no website, reference a portfolio project in the same industry.'"
                        rows={4}
                        className="text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">Use {"{{business_name}}"}, {"{{category}}"}, {"{{location}}"} as variables</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          ))}

          <Button variant="outline" className="w-full h-10 text-xs border-dashed" onClick={addStep}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Step
          </Button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sequences</h1>
          <p className="text-sm text-muted-foreground">Multi-step email sequences for automated outreach</p>
        </div>
        <Button
          size="sm"
          onClick={() => setEditing({ name: "", steps: [{ ...defaultStep, delay_days: 0 }], is_active: true })}
        >
          <Plus className="h-4 w-4 mr-1" /> New Sequence
        </Button>
      </div>

      {sequences.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Zap className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-medium text-sm">No sequences yet</h3>
            <p className="text-xs text-muted-foreground mt-1">Create a multi-step sequence to automate your outreach</p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => setEditing({ name: "", steps: [{ ...defaultStep, delay_days: 0 }], is_active: true })}
            >
              <Plus className="h-4 w-4 mr-1" /> Create First Sequence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sequences.map((seq) => (
            <Card key={seq.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setEditing(seq)}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${seq.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  <div>
                    <h3 className="text-sm font-medium">{seq.name}</h3>
                    <p className="text-xs text-muted-foreground">{seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={seq.is_active ? "default" : "secondary"} className="text-[10px]">
                    {seq.is_active ? "Active" : "Paused"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteSequence(seq.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Sequences;
