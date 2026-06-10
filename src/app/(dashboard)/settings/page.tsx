"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { changePassword, updateUserProfile } from "@/lib/api/auth";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Settings,
  Shield
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { profile, loading, refreshProfile } = useAuth();

  // Profile form state
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Import/Export state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Initialize form with profile data
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setDepartment(profile.department || "");
    }
  }, [profile]);

  const handleProfileSave = async () => {
    if (!profile) return;

    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(false);

    try {
      await updateUserProfile(profile.id, {
        full_name: fullName,
        department: department || undefined,
      });

      await refreshProfile();
      setProfileSuccess(true);

      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: unknown) {
      const error = err as Error;
      setProfileError(error.message || "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/[a-z]/.test(password)) {
      return "Password must contain at least one lowercase letter";
    }
    if (!/[0-9]/.test(password)) {
      return "Password must contain at least one number";
    }
    return null;
  };

  const handlePasswordChange = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    // Validate password strength
    const validationError = validatePassword(newPassword);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    setPasswordSaving(true);

    try {
      await changePassword(newPassword);
      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: unknown) {
      const error = err as Error;
      setPasswordError(error.message || "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="relative flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-red-500 relative z-10" />
          <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 relative">
      {/* Background ambient light */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Platform Settings</h1>
        <p className="text-(--text-faint) mt-1">
          Manage your SVF Film IP Manager account preferences and security
        </p>
      </div>

      <div className="grid gap-8 relative z-10">
        {/* Profile Settings */}
        <Card className="border-(--svf-border) bg-(--panel-solid)/40 backdrop-blur-xl shadow-2xl">
          <CardHeader className="border-b border-(--svf-border) pb-4">
            <CardTitle className="flex items-center gap-2 text-(--text)">
              <Settings className="h-5 w-5 text-red-400" />
              Profile Settings
            </CardTitle>
            <CardDescription className="text-(--text-faint)">
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {profileSuccess && (
              <Alert className="border-green-500/20 bg-green-500/10 backdrop-blur-md">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-300">
                  Profile updated successfully!
                </AlertDescription>
              </Alert>
            )}

            {profileError && (
              <Alert variant="destructive" className="border-red-500/50 bg-red-500/10 backdrop-blur-md text-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{profileError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text)">Full Name</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="bg-(--bg-deep)/50 border-(--svf-border) text-(--text) focus-visible:ring-red-500/30 focus-visible:border-red-500/50 placeholder:text-(--text-faint) transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text)">Email</label>
                <Input
                  type="email"
                  value={profile?.email || ""}
                  disabled
                  className="bg-(--panel-solid)/60 border-(--svf-border)/80 text-(--text-faint) opacity-90 cursor-not-allowed"
                />
                <p className="text-xs text-(--text-faint)">
                  Email cannot be changed
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text)">Department</label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., Legal & Rights"
                  className="bg-(--bg-deep)/50 border-(--svf-border) text-(--text) focus-visible:ring-red-500/30 focus-visible:border-red-500/50 placeholder:text-(--text-faint) transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text)">System Role</label>
                <div className="flex items-center gap-3 h-10 px-1">
                  <Badge variant="secondary" className="bg-slate-800 hover:bg-slate-700 text-(--text) border-(--svf-border) capitalize shadow-sm transition-colors cursor-default">
                    {profile?.role || "viewer"}
                  </Badge>
                  <span className="text-xs text-(--text-faint) italic">
                    Contact admin to elevate permissions
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className="bg-gradient-to-r from-red-600/90 to-amber-600/90 hover:from-red-500 hover:to-amber-500 text-white border-0 shadow-lg shadow-red-900/20 transition-all font-medium tracking-wide"
              >
                {profileSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving changes...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="border-(--svf-border) bg-(--panel-solid)/40 backdrop-blur-xl shadow-2xl">
          <CardHeader className="border-b border-(--svf-border) pb-4">
            <CardTitle className="flex items-center gap-2 text-(--text)">
              <Bell className="h-5 w-5 text-amber-400" />
              Email Notifications
            </CardTitle>
            <CardDescription className="text-(--text-faint)">
              Configure which email notifications you receive
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Link href="/settings/notifications">
              <div className="group flex items-center justify-between p-5 rounded-[12px] border border-(--svf-border) bg-(--bg-deep)/30 hover:bg-slate-800/50 hover:border-(--svf-border) transition-all cursor-pointer">
                <div className="space-y-1.5">
                  <p className="font-medium text-(--text) group-hover:text-white transition-colors">Notification Preferences</p>
                  <p className="text-sm text-(--text-faint)">
                    Choose which alerts and updates you want to receive via email
                  </p>
                </div>
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-800/50 group-hover:bg-amber-500/20 transition-colors">
                  <ChevronRight className="h-5 w-5 text-(--text-faint) group-hover:text-amber-400 transition-colors" />
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card className="border-(--svf-border) bg-(--panel-solid)/40 backdrop-blur-xl shadow-2xl">
          <CardHeader className="border-b border-(--svf-border) pb-4">
            <CardTitle className="flex items-center gap-2 text-(--text)">
              <Shield className="h-5 w-5 text-blue-400" />
              Security Settings
            </CardTitle>
            <CardDescription className="text-(--text-faint)">
              Secure your account by updating your password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {passwordSuccess && (
              <Alert className="border-green-500/20 bg-green-500/10 backdrop-blur-md">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-300">
                  Password changed successfully!
                </AlertDescription>
              </Alert>
            )}

            {passwordError && (
              <Alert variant="destructive" className="border-red-500/50 bg-red-500/10 backdrop-blur-md text-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text)">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="bg-(--bg-deep)/50 border-(--svf-border) text-(--text) focus-visible:ring-blue-500/30 focus-visible:border-blue-500/50 placeholder:text-(--text-faint) transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-(--text)">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="bg-(--bg-deep)/50 border-(--svf-border) text-(--text) focus-visible:ring-blue-500/30 focus-visible:border-blue-500/50 placeholder:text-(--text-faint) transition-colors"
                />
              </div>
            </div>

            <div className="rounded-lg bg-(--bg-raise)/40 border border-(--svf-border) p-4">
              <p className="text-sm font-medium text-(--text) mb-2">Password requirements:</p>
              <ul className="text-sm text-(--text-faint) space-y-1.5 list-disc list-inside ml-1">
                <li className={newPassword.length >= 8 ? "text-green-400/80" : ""}>At least 8 characters long</li>
                <li className={/[A-Z]/.test(newPassword) ? "text-green-400/80" : ""}>At least one uppercase letter</li>
                <li className={/[a-z]/.test(newPassword) ? "text-green-400/80" : ""}>At least one lowercase letter</li>
                <li className={/[0-9]/.test(newPassword) ? "text-green-400/80" : ""}>At least one number</li>
              </ul>
            </div>

            <div className="pt-2">
              <Button
                onClick={handlePasswordChange}
                disabled={passwordSaving || !newPassword || !confirmPassword}
                className="bg-slate-800 hover:bg-slate-700 text-(--text) border border-(--svf-border) hover:border-slate-600 shadow-lg shadow-slate-900/20 transition-all font-medium tracking-wide"
              >
                {passwordSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-(--text-faint)" />
                    Updating security...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Database Settings */}
        {/* <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database
            </CardTitle>
            <CardDescription>
              Data management and import/export
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <Button variant="outline" onClick={() => setShowExportDialog(true)}>Export All Data</Button>
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>Import CSV</Button>
            </div>

            <CSVImportDialog
              open={showImportDialog}
              onOpenChange={setShowImportDialog}
              onSuccess={() => {}}
            />
            <ExportDialog
              open={showExportDialog}
              onOpenChange={setShowExportDialog}
            />
            <Separator />
            <div className="text-sm text-muted-foreground">
              <p>Last sync: January 31, 2024 at 10:30 AM</p>
              <p>Total records: 636 movies, 1,005 people, 2,500 rights</p>
            </div>
          </CardContent>
        </Card> */}
      </div>
    </div>
  );
}
