"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Send, RefreshCw, Info, CheckCircle2 } from "lucide-react";
import { useAppToast } from "@/hooks/use-app-toast";
import { format, addDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";

export default function NotificationTestPage() {
    const toast = useAppToast();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ sent: number; errors: number; timestamp: string } | null>(null);
    const [mockDays, setMockDays] = useState(0);
    const [expiringPreview, setExpiringPreview] = useState<{
        milestone90: any[];
        milestone30: any[];
        daily: any[];
        upcoming: any[];
    }>({ milestone90: [], milestone30: [], daily: [], upcoming: [] });

    const mockDate = addDays(new Date(), mockDays);

    const fetchPreview = async () => {
        setLoading(true);
        try {
            const supabase = createClient();

            // Fetch rights
            const { data: rights } = await supabase
                .from("expiring_rights")
                .select("*, start_date, end_date, license_type, category, nature")
                .order("end_date", { ascending: true });

            // Fetch movies
            const { data: movies } = await supabase
                .from("movies")
                .select("id, title, agreement_start_date, agreement_end_date, source")
                .eq("source", "acquired")
                .not("agreement_end_date", "is", null);

            const m90: any[] = [];
            const m30: any[] = [];
            const dly: any[] = [];
            const upc: any[] = [];

            const refDate = new Date(mockDate);
            refDate.setHours(0, 0, 0, 0);

            (rights || []).forEach((r: any) => {
                const endDate = new Date(r.end_date);
                endDate.setHours(0, 0, 0, 0);
                const diff = Math.ceil((endDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));

                const item = {
                    title: r.movie_title,
                    subTitle: r.platform_name,
                    days: diff,
                    type: 'Right',
                    id: r.id,
                    startDate: r.start_date,
                    endDate: r.end_date,
                    licenseType: r.license_type,
                    nature: r.nature
                };
                if (diff === 90) m90.push(item);
                else if (diff === 30) m30.push(item);
                else if (diff <= 7 && diff >= 0) dly.push(item);
                else if (diff > 0 && diff < 90) upc.push(item);
            });

            (movies || []).forEach((m: any) => {
                const endDate = new Date(m.agreement_end_date!);
                endDate.setHours(0, 0, 0, 0);
                const diff = Math.ceil((endDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));

                const item = {
                    title: m.title,
                    subTitle: 'Movie Agreement',
                    days: diff,
                    type: 'Movie',
                    id: m.id,
                    startDate: m.agreement_start_date,
                    endDate: m.agreement_end_date
                };
                if (diff === 90) m90.push(item);
                else if (diff === 30) m30.push(item);
                else if (diff <= 7 && diff >= 0) dly.push(item);
                else if (diff > 0 && diff < 90) upc.push(item);
            });

            setExpiringPreview({ milestone90: m90, milestone30: m30, daily: dly, upcoming: upc });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPreview();
    }, [mockDays]);

    const runTest = async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch("/api/notifications/test-alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mockDate: mockDate.toISOString() }),
            });
            const data = await res.json();
            if (data.success) {
                setResult(data);
            } else {
                toast.error(data.error || "Failed to trigger alerts");
            }
        } catch {
            toast.error("Request failed");
        } finally {
            setLoading(false);
        }
    };

    const sendSampleEmail = async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch("/api/notifications/test-email", {
                method: "POST",
            });
            const data = await res.json();
            if (data.success) {
                setResult({ sent: 1, errors: 0, timestamp: new Date().toISOString() });
            } else {
                toast.error(data.error || "Failed to send sample email");
            }
        } catch {
            toast.error("Request failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto py-10 space-y-8">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Notification System Test</h1>
                    <p className="text-muted-foreground mt-2">
                        Verify expiry notifications for rights and movie agreements.
                    </p>
                </div>
                <Badge variant="outline" className="text-xs">
                    Milestones: 90d, 30d, Final Week (Daily)
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Configuration Card */}
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarIcon className="h-5 w-5" />
                            Test Configuration
                        </CardTitle>
                        <CardDescription>Simulate different dates to see what triggers</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Virtual Date</label>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="icon" onClick={() => setMockDays(d => d - 1)}>-</Button>
                                <div className="flex-1 text-center font-mono bg-muted p-2 rounded">
                                    {format(mockDate, "yyyy-MM-dd")}
                                </div>
                                <Button variant="outline" size="icon" onClick={() => setMockDays(d => d + 1)}>+</Button>
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                                {mockDays === 0 ? "Today" : `${Math.abs(mockDays)} days ${mockDays > 0 ? 'ahead' : 'behind'}`}
                            </p>
                        </div>

                        <Button className="w-full" variant="outline" onClick={() => setMockDays(0)}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Reset to Today
                        </Button>

                        <div className="pt-4 border-t space-y-2">
                            <Button
                                className="w-full"
                                onClick={runTest}
                                disabled={loading}
                            >
                                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Trigger Alerts (All)
                            </Button>

                            <Button
                                className="w-full"
                                variant="secondary"
                                onClick={sendSampleEmail}
                                disabled={loading}
                            >
                                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                Send Sample Email to Me
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Results/Status Card */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Execution Result</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {result && (
                            <div className="rounded-lg border border-green-500/30 bg-green-950/20 px-4 py-3 space-y-2">
                                <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Alerts triggered successfully
                                </div>
                                <p className="text-sm text-green-300/80">
                                    Simulated date {format(new Date(result.timestamp), "HH:mm:ss")} — <strong>{result.sent}</strong> sent, <strong>{result.errors}</strong> errors.
                                </p>
                                <div className="flex items-center gap-4 pt-1">
                                    <Button size="sm" variant="outline" onClick={() => window.open('/notifications', '_blank')}>
                                        <Info className="mr-2 h-4 w-4" />
                                        View UI Notifications
                                    </Button>
                                    <p className="text-xs text-muted-foreground italic">Check server logs if Resend is not configured.</p>
                                </div>
                            </div>
                        )}

                        {!result && (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                                <Info className="h-8 w-8 mb-2 opacity-50" />
                                <p>Run a test to see results</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 90d Milestone Preview */}
                <Card>
                    <CardHeader className="bg-blue-600/10 dark:bg-blue-900/20">
                        <CardTitle className="text-blue-600 dark:text-blue-400 flex items-center justify-between">
                            90d Milestone
                            <Badge variant="secondary">{expiringPreview.milestone90.length}</Badge>
                        </CardTitle>
                        <CardDescription>Triggers on exactly 90 days</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {expiringPreview.milestone90.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No items at exactly 90 days.</p>
                        ) : (
                            <div className="space-y-3">
                                {expiringPreview.milestone90.map((item, i) => (
                                    <div key={i} className="text-sm p-2 bg-muted/40 rounded border">
                                        <p className="font-semibold">{item.title}</p>
                                        <p className="text-xs text-muted-foreground">{item.subTitle}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 30d Milestone Preview */}
                <Card>
                    <CardHeader className="bg-amber-600/10 dark:bg-amber-900/20">
                        <CardTitle className="text-amber-600 dark:text-amber-400 flex items-center justify-between">
                            30d Milestone
                            <Badge variant="secondary">{expiringPreview.milestone30.length}</Badge>
                        </CardTitle>
                        <CardDescription>Triggers on exactly 30 days</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {expiringPreview.milestone30.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No items at exactly 30 days.</p>
                        ) : (
                            <div className="space-y-3">
                                {expiringPreview.milestone30.map((item, i) => (
                                    <div key={i} className="text-sm p-2 bg-muted/40 rounded border">
                                        <p className="font-semibold">{item.title}</p>
                                        <p className="text-xs text-muted-foreground">{item.subTitle}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Daily Preview */}
                <Card>
                    <CardHeader className="bg-red-600/10 dark:bg-red-900/20">
                        <CardTitle className="text-red-600 dark:text-red-400 flex items-center justify-between">
                            Final Week (Daily)
                            <Badge variant="secondary">{expiringPreview.daily.length}</Badge>
                        </CardTitle>
                        <CardDescription>Triggers daily (0-7 days left)</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        {expiringPreview.daily.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No items in final week.</p>
                        ) : (
                            <div className="space-y-3">
                                {expiringPreview.daily.map((item, i) => (
                                    <div key={i} className="text-sm p-2 bg-muted/40 rounded border flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">{item.title}</p>
                                            <p className="text-xs text-muted-foreground">{item.subTitle}</p>
                                        </div>
                                        <Badge variant="destructive">{item.days}d</Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Upcoming Tracked Items */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-muted-foreground" />
                        All Tracked Items (Upcoming 1-90 Days)
                    </CardTitle>
                    <CardDescription>
                        These items are being monitored. Alerts are only sent at **90 days**, **30 days**, or **daily in the final week**.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {expiringPreview.upcoming.length === 0 && expiringPreview.milestone90.length === 0 && expiringPreview.milestone30.length === 0 && expiringPreview.daily.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No upcoming expirations found in the next 90 days.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[...expiringPreview.milestone90, ...expiringPreview.milestone30, ...expiringPreview.daily, ...expiringPreview.upcoming]
                                .sort((a, b) => a.days - b.days)
                                .map((item, i) => (
                                    <div key={i} className={`p-3 border rounded-lg transition-colors ${item.days === 90 || item.days === 30 || item.days <= 7 ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <Badge variant={item.days <= 7 ? "destructive" : item.days <= 30 ? "warning" : "outline"}>
                                                {item.days}d left
                                            </Badge>
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase">{item.type}</p>
                                        </div>
                                        <p className="font-medium text-xs line-clamp-1">{item.title}</p>
                                        <p className="text-[10px] text-muted-foreground line-clamp-1">{item.subTitle}</p>

                                        <div className="mt-2 space-y-1 text-[10px] border-t pt-2">
                                            <p className="text-muted-foreground flex justify-between">
                                                <span>End Date:</span>
                                                <span className="font-medium">{format(new Date(item.endDate), "dd MMM yyyy")}</span>
                                            </p>
                                            {item.startDate && (
                                                <p className="text-muted-foreground flex justify-between">
                                                    <span>Start Date:</span>
                                                    <span>{format(new Date(item.startDate), "dd MMM yyyy")}</span>
                                                </p>
                                            )}
                                            {item.licenseType && (
                                                <p className="text-muted-foreground flex justify-between">
                                                    <span>Type:</span>
                                                    <span>{item.licenseType}</span>
                                                </p>
                                            )}
                                        </div>

                                        {(item.days === 90 || item.days === 30 || item.days <= 7) && (
                                            <div className="mt-2 text-[10px] text-primary flex items-center gap-1 font-bold">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Alert Status: ACTIVE
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
