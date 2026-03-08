import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, X, Save } from "lucide-react";

interface ICPProfile {
  id?: string;
  name: string;
  is_active: boolean;
  industries: string[];
  locations: string[];
  size_range: string | null;
  has_website_preference: string;
  pain_points: string[];
  weight_industry: number;
  weight_location: number;
  weight_no_website: number;
  weight_has_email: number;
}

const defaultProfile: ICPProfile = {
  name: "Default ICP",
  is_active: true,
  industries: [],
  locations: [],
  size_range: null,
  has_website_preference: "no_website",
  pain_points: [],
  weight_industry: 3,
  weight_location: 2,
  weight_no_website: 4,
  weight_has_email: 3,
};

export const ICPProfileCard = ({ userId }: { userId: string }) => {
  const { toast } = useToast();
  const [profile, setProfile] = useState<ICPProfile>(defaultProfile);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newIndustry, setNewIndustry] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newPainPoint, setNewPainPoint] = useState("");

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("icp_profiles")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (data) {
      setProfileId(data.id);
      setProfile({
        name: data.name,
        is_active: data.is_active,
        industries: data.industries || [],
        locations: data.locations || [],
        size_range: data.size_range,
        has_website_preference: data.has_website_preference || "no_website",
        pain_points: data.pain_points || [],
        weight_industry: data.weight_industry,
        weight_location: data.weight_location,
        weight_no_website: data.weight_no_website,
        weight_has_email: data.weight_has_email,
      });
    }
  };

  const saveProfile = async () => {
    setLoading(true);
    try {
      const payload = { user_id: userId, ...profile };
      if (profileId) {
        const { error } = await supabase.from("icp_profiles").update(payload).eq("id", profileId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("icp_profiles").insert(payload).select("id").single();
        if (error) throw error;
        setProfileId(data.id);
      }
      toast({ title: "ICP profile saved" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const addToList = (key: "industries" | "locations" | "pain_points", value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    setProfile((p) => ({ ...p, [key]: [...p[key], value.trim()] }));
    setter("");
  };

  const removeFromList = (key: "industries" | "locations" | "pain_points", index: number) => {
    setProfile((p) => ({ ...p, [key]: p[key].filter((_, i) => i !== index) }));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" /> Ideal Customer Profile
            </CardTitle>
            <CardDescription className="text-xs">Define your ideal lead — AI scores new leads against this</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={saveProfile} disabled={loading}>
            <Save className="h-3.5 w-3.5 mr-1" /> {loading ? "Saving..." : "Save ICP"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Industries */}
        <div className="space-y-1.5">
          <Label className="text-xs">Target Industries</Label>
          <div className="flex gap-2">
            <Input value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} placeholder="e.g. Restaurants, Salons" className="h-9 text-xs" onKeyDown={(e) => e.key === "Enter" && addToList("industries", newIndustry, setNewIndustry)} />
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => addToList("industries", newIndustry, setNewIndustry)}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {profile.industries.map((v, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs">
                {v} <button onClick={() => removeFromList("industries", i)}><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
          </div>
        </div>

        {/* Locations */}
        <div className="space-y-1.5">
          <Label className="text-xs">Target Locations</Label>
          <div className="flex gap-2">
            <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="e.g. Nairobi, Mombasa" className="h-9 text-xs" onKeyDown={(e) => e.key === "Enter" && addToList("locations", newLocation, setNewLocation)} />
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => addToList("locations", newLocation, setNewLocation)}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {profile.locations.map((v, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs">
                {v} <button onClick={() => removeFromList("locations", i)}><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
          </div>
        </div>

        {/* Website Preference */}
        <div className="space-y-1.5">
          <Label className="text-xs">Website Status Preference</Label>
          <RadioGroup value={profile.has_website_preference} onValueChange={(v) => setProfile((p) => ({ ...p, has_website_preference: v }))} className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="no_website" />
              <span className="text-xs">No website (highest need)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="poor_website" />
              <span className="text-xs">Poor website</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <RadioGroupItem value="any" />
              <span className="text-xs">Any</span>
            </label>
          </RadioGroup>
        </div>

        {/* Pain Points */}
        <div className="space-y-1.5">
          <Label className="text-xs">Key Pain Points</Label>
          <div className="flex gap-2">
            <Input value={newPainPoint} onChange={(e) => setNewPainPoint(e.target.value)} placeholder="e.g. No online ordering" className="h-9 text-xs" onKeyDown={(e) => e.key === "Enter" && addToList("pain_points", newPainPoint, setNewPainPoint)} />
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => addToList("pain_points", newPainPoint, setNewPainPoint)}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {profile.pain_points.map((v, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/20 text-accent-foreground text-xs">
                {v} <button onClick={() => removeFromList("pain_points", i)}><X className="h-2.5 w-2.5" /></button>
              </span>
            ))}
          </div>
        </div>

        {/* Signal Weights */}
        <div className="space-y-3 pt-2 border-t border-border">
          <Label className="text-xs font-medium">Signal Weights (how much each factor matters)</Label>
          {[
            { key: "weight_industry" as const, label: "Industry match" },
            { key: "weight_location" as const, label: "Location match" },
            { key: "weight_no_website" as const, label: "No website" },
            { key: "weight_has_email" as const, label: "Has email" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
              <Slider
                value={[profile[key]]}
                onValueChange={([v]) => setProfile((p) => ({ ...p, [key]: v }))}
                min={0}
                max={5}
                step={1}
                className="flex-1"
              />
              <span className="text-xs font-medium w-4 text-right">{profile[key]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
