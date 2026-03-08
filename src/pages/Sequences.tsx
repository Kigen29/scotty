import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, GripVertical, Mail, Clock, ArrowDown, Zap,
  ChevronDown, ChevronUp, Sparkles, Loader2, Wand2, RotateCcw,
  Send, UserPlus, Bookmark, BarChart3, Eye, Reply, Pause, Play, Users, X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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

interface SavedTemplate {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
}

interface StepAnalytics {
  step_index: number;
  sent: number;
  opened: number;
  replied: number;
}

const defaultStep: SequenceStep = {
  subject: "",
  body_prompt: "",
  delay_days: 3,
  channel: "email",
};

const PRESET_TEMPLATES = [
  {
    name: "Cold Outreach",
    icon: Send,
    description: "Initial contact with new prospects",
    steps: [
      { subject: "Quick question about {{business_name}}", body_prompt: "Introduce yourself briefly, mention you noticed {{business_name}} in {{location}} and that they could benefit from your services. Keep it short and end with a simple question.", delay_days: 0, channel: "email" as const },
      { subject: "Following up — {{business_name}}", body_prompt: "Reference the first email, add a specific value proposition relevant to {{category}} businesses. Mention a quick win or case study.", delay_days: 3, channel: "email" as const },
      { subject: "Last note for {{business_name}}", body_prompt: "Final follow-up. Be direct about the value you can provide. Include a clear call to action with a specific time to chat. Create mild urgency without being pushy.", delay_days: 4, channel: "email" as const },
    ],
  },
  {
    name: "Follow-up Nurture",
    icon: RotateCcw,
    description: "Re-engage leads who went quiet",
    steps: [
      { subject: "Checking in — {{business_name}}", body_prompt: "Warm re-engagement email. Reference previous contact, share something new or valuable (tip, resource, industry insight) relevant to {{category}}.", delay_days: 0, channel: "email" as const },
      { subject: "Thought you'd find this useful", body_prompt: "Share a relevant case study or success story from a similar {{category}} business. Make it about them, not you.", delay_days: 5, channel: "email" as const },
    ],
  },
  {
    name: "Re-engagement",
    icon: UserPlus,
    description: "Win back cold or lost leads",
    steps: [
      { subject: "It's been a while, {{business_name}}", body_prompt: "Acknowledge the gap since last contact. Share what's changed or improved in your offering that's relevant to {{category}} businesses in {{location}}.", delay_days: 0, channel: "email" as const },
      { subject: "New opportunity for {{business_name}}", body_prompt: "Present a fresh angle or limited-time offer. Reference their specific situation and why now is a good time to reconnect.", delay_days: 4, channel: "email" as const },
      { subject: "Moving on — unless you're interested?", body_prompt: "Breakup email. Let them know you won't follow up again unless they're interested. Simple yes/no CTA. Often gets the highest response rate.", delay_days: 5, channel: "email" as const },
    ],
  },
];

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

  // Templates state
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Analytics state
  const [analyticsSeqId, setAnalyticsSeqId] = useState<string | null>(null);
  const [stepAnalytics, setStepAnalytics] = useState<StepAnalytics[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Bulk enrollment state
  const [enrollSeqId, setEnrollSeqId] = useState<string | null>(null);
  const [availableLeads, setAvailableLeads] = useState<{ id: string; business_name: string; email: string | null; location: string | null }[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");

  // Manage enrollments state
  const [manageSeqId, setManageSeqId] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<{ id: string; lead_id: string; status: string; current_step: number; business_name: string; email: string | null }[]>([]);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false);

  // Enrollment counts per sequence
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({});

  const fetchEnrollmentCounts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("sequence_enrollments")
      .select("sequence_id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "paused"]);
    if (data) {
      const counts: Record<string, number> = {};
      data.forEach((e) => {
        counts[e.sequence_id] = (counts[e.sequence_id] || 0) + 1;
      });
      setEnrollmentCounts(counts);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSequences();
      fetchSavedTemplates();
      fetchEnrollmentCounts();
    }
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

  const fetchSavedTemplates = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("sequence_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      setSavedTemplates(
        data.map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description || "",
          steps: (t.steps as any as SequenceStep[]) || [],
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

  // Save as template
  const saveAsTemplate = async () => {
    if (!user || !editing || !templateName.trim()) {
      toast({ title: "Template name required", variant: "destructive" });
      return;
    }
    setSavingTemplate(true);
    try {
      const { error } = await supabase.from("sequence_templates").insert({
        user_id: user.id,
        name: templateName,
        description: templateDesc,
        steps: editing.steps as any,
      });
      if (error) throw error;
      toast({ title: "Template saved!" });
      setSaveTemplateOpen(false);
      setTemplateName("");
      setTemplateDesc("");
      fetchSavedTemplates();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await supabase.from("sequence_templates").delete().eq("id", id);
    if (!error) {
      toast({ title: "Template deleted" });
      fetchSavedTemplates();
    }
  };

  // Analytics
  const fetchAnalytics = async (seqId: string, stepCount: number) => {
    if (!user) return;
    setAnalyticsSeqId(seqId);
    setAnalyticsLoading(true);
    try {
      // Get enrollments for this sequence
      const { data: enrollments } = await supabase
        .from("sequence_enrollments")
        .select("lead_id, current_step")
        .eq("sequence_id", seqId)
        .eq("user_id", user.id);

      if (!enrollments?.length) {
        setStepAnalytics(
          Array.from({ length: stepCount }, (_, i) => ({ step_index: i, sent: 0, opened: 0, replied: 0 }))
        );
        setAnalyticsLoading(false);
        return;
      }

      const leadIds = enrollments.map((e) => e.lead_id);

      // Get campaigns for these leads
      const { data: campaigns } = await supabase
        .from("email_campaigns")
        .select("lead_id, status, sent_at, opened_at, template_type")
        .eq("user_id", user.id)
        .in("lead_id", leadIds);

      // Get conversations (replies) for these leads
      const { data: replies } = await supabase
        .from("conversations")
        .select("lead_id")
        .eq("user_id", user.id)
        .eq("direction", "inbound")
        .in("lead_id", leadIds);

      const replyLeadIds = new Set(replies?.map((r) => r.lead_id) || []);

      // Build per-step analytics based on enrollment progress
      const analytics: StepAnalytics[] = Array.from({ length: stepCount }, (_, i) => {
        // Leads that reached at least this step
        const reachedLeads = enrollments.filter((e) => e.current_step >= i);
        const reachedLeadIds = reachedLeads.map((e) => e.lead_id);

        const stepCampaigns = campaigns?.filter((c) => reachedLeadIds.includes(c.lead_id)) || [];
        // Approximate: distribute campaigns across steps by order
        const sentCount = reachedLeads.length;
        const openedCount = stepCampaigns.filter((c) => c.opened_at).length;
        const repliedCount = reachedLeadIds.filter((id) => replyLeadIds.has(id)).length;

        return {
          step_index: i,
          sent: sentCount,
          opened: Math.min(openedCount, sentCount),
          replied: Math.min(repliedCount, sentCount),
        };
      });

      setStepAnalytics(analytics);
    } catch {
      setStepAnalytics(
        Array.from({ length: stepCount }, (_, i) => ({ step_index: i, sent: 0, opened: 0, replied: 0 }))
      );
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Bulk enrollment
  const openEnrollDialog = async (seqId: string) => {
    if (!user) return;
    setEnrollSeqId(seqId);
    setSelectedLeadIds(new Set());
    setLeadSearch("");
    setLeadsLoading(true);

    // Get already enrolled lead IDs for this sequence
    const { data: existing } = await supabase
      .from("sequence_enrollments")
      .select("lead_id")
      .eq("sequence_id", seqId)
      .eq("user_id", user.id)
      .in("status", ["active", "paused"]);

    const enrolledIds = new Set((existing || []).map((e) => e.lead_id));

    // Get all leads with email
    const { data: leads } = await supabase
      .from("leads")
      .select("id, business_name, email, location")
      .eq("user_id", user.id)
      .not("email", "is", null)
      .eq("unsubscribed", false)
      .order("created_at", { ascending: false });

    setAvailableLeads(
      (leads || []).filter((l) => !enrolledIds.has(l.id))
    );
    setLeadsLoading(false);
  };

  const enrollLeads = async () => {
    if (!user || !enrollSeqId || selectedLeadIds.size === 0) return;
    setEnrolling(true);
    try {
      const rows = Array.from(selectedLeadIds).map((lead_id) => ({
        user_id: user.id,
        sequence_id: enrollSeqId,
        lead_id,
        current_step: 0,
        status: "active" as const,
        next_step_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("sequence_enrollments").insert(rows);
      if (error) throw error;

      toast({ title: `${selectedLeadIds.size} lead${selectedLeadIds.size > 1 ? "s" : ""} enrolled!` });
      setEnrollSeqId(null);
      setSelectedLeadIds(new Set());
    } catch (error: any) {
      toast({ title: "Enrollment failed", description: error.message, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  };

  const filteredLeads = availableLeads.filter((l) => {
    if (!leadSearch) return true;
    const q = leadSearch.toLowerCase();
    return l.business_name.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.location?.toLowerCase().includes(q);
  });

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  // Manage enrollments
  const openManageDialog = async (seqId: string) => {
    if (!user) return;
    setManageSeqId(seqId);
    setEnrollmentsLoading(true);
    const { data } = await supabase
      .from("sequence_enrollments")
      .select("id, lead_id, status, current_step, leads(business_name, email)")
      .eq("sequence_id", seqId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setEnrollments(
      (data || []).map((e: any) => ({
        id: e.id,
        lead_id: e.lead_id,
        status: e.status,
        current_step: e.current_step,
        business_name: e.leads?.business_name || "Unknown",
        email: e.leads?.email || null,
      }))
    );
    setEnrollmentsLoading(false);
  };

  const updateEnrollmentStatus = async (enrollmentId: string, newStatus: string) => {
    const { error } = await supabase
      .from("sequence_enrollments")
      .update({ status: newStatus })
      .eq("id", enrollmentId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: newStatus === "paused" ? "Enrollment paused" : "Enrollment resumed" });
      if (manageSeqId) openManageDialog(manageSeqId);
    }
  };

  const removeEnrollment = async (enrollmentId: string) => {
    const { error } = await supabase
      .from("sequence_enrollments")
      .delete()
      .eq("id", enrollmentId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Lead removed from sequence" });
      if (manageSeqId) openManageDialog(manageSeqId);
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTemplateName(editing.name);
                setSaveTemplateOpen(true);
              }}
              disabled={editing.steps.length === 0}
            >
              <Bookmark className="h-3.5 w-3.5 mr-1" /> Save as Template
            </Button>
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
              {editing.id ? "Regenerate with AI" : "Generate with AI"}
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
                        placeholder="Describe what this email should say. AI will personalize it per lead."
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

        {/* Save as Template Dialog */}
        <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Save as Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Template Name</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. My Winning Cold Outreach"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description (optional)</Label>
                <Input
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="What's this template good for?"
                  className="h-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {editing.steps.length} step{editing.steps.length !== 1 ? "s" : ""} will be saved
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={saveAsTemplate} disabled={savingTemplate}>
                {savingTemplate ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Bookmark className="h-3.5 w-3.5 mr-1" />}
                {savingTemplate ? "Saving..." : "Save Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 space-y-6 max-w-4xl">
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

      {/* Preset & Custom Templates */}
      <div>
        <h2 className="text-sm font-medium mb-2">Start from a template</h2>
        <div className="grid grid-cols-3 gap-3">
          {PRESET_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <Card
                key={tpl.name}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => setEditing({ name: tpl.name, steps: tpl.steps, is_active: true })}
              >
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{tpl.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{tpl.description}</p>
                  <p className="text-[10px] text-muted-foreground/70">{tpl.steps.length} steps</p>
                </CardContent>
              </Card>
            );
          })}
          {savedTemplates.map((tpl) => (
            <Card
              key={tpl.id}
              className="cursor-pointer hover:border-primary/40 transition-colors relative group"
              onClick={() => setEditing({ name: tpl.name, steps: tpl.steps, is_active: true })}
            >
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Bookmark className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium truncate">{tpl.name}</span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{tpl.description || "Custom template"}</p>
                <p className="text-[10px] text-muted-foreground/70">{tpl.steps.length} steps</p>
              </CardContent>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-destructive"
                onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* Sequences List */}
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
        <div className="space-y-3">
          <h2 className="text-sm font-medium">Your Sequences</h2>
          {sequences.map((seq) => (
            <div key={seq.id}>
              <Card className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setEditing(seq)}>
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${seq.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                      <div>
                        <h3 className="text-sm font-medium flex items-center gap-1.5">
                          {seq.name}
                          {(enrollmentCounts[seq.id!] ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal">
                              {enrollmentCounts[seq.id!]} enrolled
                            </Badge>
                          )}
                        </h3>
                        <p className="text-xs text-muted-foreground">{seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (analyticsSeqId === seq.id) {
                            setAnalyticsSeqId(null);
                          } else {
                            fetchAnalytics(seq.id, seq.steps.length);
                          }
                        }}
                      >
                        <BarChart3 className="h-3.5 w-3.5 mr-1" />
                        Analytics
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEnrollDialog(seq.id);
                        }}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1" />
                        Enroll Leads
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          openManageDialog(seq.id);
                        }}
                      >
                        <Users className="h-3.5 w-3.5 mr-1" />
                        Manage
                      </Button>
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
                  </div>

                  {/* Inline Analytics */}
                  {analyticsSeqId === seq.id && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      {analyticsLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          <span className="text-xs text-muted-foreground ml-2">Loading analytics...</span>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-4 gap-y-2 text-[11px]">
                            <div className="font-medium text-muted-foreground">Step</div>
                            <div className="font-medium text-muted-foreground flex items-center gap-1"><Send className="h-3 w-3" /> Sent</div>
                            <div className="font-medium text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" /> Opened</div>
                            <div className="font-medium text-muted-foreground flex items-center gap-1"><Reply className="h-3 w-3" /> Replied</div>
                            {stepAnalytics.map((sa) => {
                              const openRate = sa.sent > 0 ? Math.round((sa.opened / sa.sent) * 100) : 0;
                              const replyRate = sa.sent > 0 ? Math.round((sa.replied / sa.sent) * 100) : 0;
                              return (
                                <>
                                  <div key={`label-${sa.step_index}`} className="font-medium">Step {sa.step_index + 1}</div>
                                  <div key={`sent-${sa.step_index}`}>{sa.sent}</div>
                                  <div key={`opened-${sa.step_index}`} className="flex items-center gap-2">
                                    <Progress value={openRate} className="h-1.5 flex-1" />
                                    <span>{openRate}%</span>
                                  </div>
                                  <div key={`replied-${sa.step_index}`} className="flex items-center gap-2">
                                    <Progress value={replyRate} className="h-1.5 flex-1" />
                                    <span>{replyRate}%</span>
                                  </div>
                                </>
                              );
                            })}
                          </div>
                          {stepAnalytics.every((sa) => sa.sent === 0) && (
                            <p className="text-[11px] text-muted-foreground text-center py-2">No data yet — enroll leads to see analytics</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Enrollment Dialog */}
      <Dialog open={!!enrollSeqId} onOpenChange={(open) => { if (!open) setEnrollSeqId(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Enroll Leads into Sequence</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <Input
              placeholder="Search leads..."
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {leadsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground ml-2">Loading leads...</span>
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <UserPlus className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">{availableLeads.length === 0 ? "No eligible leads found" : "No leads match your search"}</p>
                <p className="text-xs mt-1">Leads need an email and must not already be enrolled</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button onClick={toggleAll} className="hover:text-foreground transition-colors">
                    {selectedLeadIds.size === filteredLeads.length ? "Deselect all" : "Select all"} ({filteredLeads.length})
                  </button>
                  <span>{selectedLeadIds.size} selected</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[40vh]">
                  {filteredLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                        selectedLeadIds.has(lead.id) ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"
                      }`}
                      onClick={() => toggleLead(lead.id)}
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                        selectedLeadIds.has(lead.id) ? "bg-primary border-primary" : "border-muted-foreground/30"
                      }`}>
                        {selectedLeadIds.has(lead.id) && (
                          <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{lead.business_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{lead.email}{lead.location ? ` · ${lead.location}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEnrollSeqId(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={selectedLeadIds.size === 0 || enrolling}
              onClick={enrollLeads}
            >
              {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
              Enroll {selectedLeadIds.size > 0 ? `${selectedLeadIds.size} Lead${selectedLeadIds.size > 1 ? "s" : ""}` : "Leads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Enrollments Dialog */}
      <Dialog open={!!manageSeqId} onOpenChange={(open) => { if (!open) setManageSeqId(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Enrolled Leads</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            {enrollmentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground ml-2">Loading enrollments...</span>
              </div>
            ) : enrollments.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No leads enrolled yet</p>
                <p className="text-xs mt-1">Use "Enroll Leads" to add leads to this sequence</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[50vh]">
                {enrollments.map((enrollment) => (
                  <div
                    key={enrollment.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{enrollment.business_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground truncate">{enrollment.email || "No email"}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">Step {enrollment.current_step + 1}</span>
                        <Badge
                          variant={enrollment.status === "active" ? "default" : "secondary"}
                          className="text-[9px] h-4"
                        >
                          {enrollment.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {enrollment.status === "active" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Pause enrollment"
                          onClick={() => updateEnrollmentStatus(enrollment.id, "paused")}
                        >
                          <Pause className="h-3.5 w-3.5 text-amber-500" />
                        </Button>
                      ) : enrollment.status === "paused" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Resume enrollment"
                          onClick={() => updateEnrollmentStatus(enrollment.id, "active")}
                        >
                          <Play className="h-3.5 w-3.5 text-emerald-500" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Remove from sequence"
                        onClick={() => removeEnrollment(enrollment.id)}
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManageSeqId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sequences;
