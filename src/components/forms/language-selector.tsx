"use client";

import { useEffect, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { getLanguages } from "@/lib/api/movies";

interface LanguageSelectorProps {
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
}

const COMMON_LANGUAGES = [
    "Bengali",
    "Hindi",
    "English",
    "Tamil",
    "Telugu",
    "Malayalam",
    "Kannada",
    "Marathi",
    "Gujarati",
    "Punjabi",
    "Odia",
    "Assamese",
];

export function LanguageSelector({ value, onValueChange, placeholder = "Select language..." }: LanguageSelectorProps) {
    const [dbLanguages, setDbLanguages] = useState<string[]>([]);
    const [showCustom, setShowCustom] = useState(false);
    const [customValue, setCustomValue] = useState("");

    useEffect(() => {
        getLanguages().then((langs) => {
            setDbLanguages(langs);
        }).catch(() => { });
    }, []);

    // Check if current value is in the predefined lists
    const normalize = (s: string) => s.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

    const normalizedCommon = COMMON_LANGUAGES.map(normalize);
    const normalizedDb = dbLanguages.map(normalize);

    const allKnownLanguages = Array.from(new Set([...normalizedCommon, ...normalizedDb]));
    const isKnown = allKnownLanguages.includes(normalize(value || ""));

    useEffect(() => {
        const normalizedVal = normalize(value || "");
        if (value && !isKnown && !showCustom) {
            setShowCustom(true);
            setCustomValue(normalizedVal);
        }
    }, [value, isKnown, showCustom]);

    const handleSelectChange = (val: string) => {
        if (val === "custom") {
            setShowCustom(true);
            onValueChange(customValue);
        } else {
            setShowCustom(false);
            onValueChange(val);
        }
    };

    const handleCustomChange = (val: string) => {
        setCustomValue(val);
        onValueChange(val);
    };

    return (
        <div className="space-y-2">
            <Select value={showCustom ? "custom" : value} onValueChange={handleSelectChange}>
                <SelectTrigger>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {allKnownLanguages.sort().map((lang) => (
                        <SelectItem key={lang} value={lang}>
                            {lang}
                        </SelectItem>
                    ))}
                    <SelectItem value="custom" className="text-primary font-medium">
                        Other...
                    </SelectItem>
                </SelectContent>
            </Select>

            {showCustom && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <Input
                        placeholder="Type custom language..."
                        value={customValue}
                        onChange={(e) => handleCustomChange(e.target.value)}
                        className="h-9"
                    />
                </div>
            )}
        </div>
    );
}
