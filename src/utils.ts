export function html(text: unknown) {
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function slug(text: unknown) {
	return String(text || "rotation")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "rotation";
}

export function makeId(prefix: string) {
	return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function dateStamp(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

export function dateTimeStamp(date = new Date()) {
	return date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

export function clampInt(value: unknown, min: number, max: number, fallback = min) {
	const number = Math.round(Number(value));
	return clamp(Number.isFinite(number) ? number : fallback, min, max);
}

export function saveFile(name: string, obj: unknown) {
	const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 300);
}

export function readJsonFile(file: File | null | undefined, done: (data: any) => void) {
	if (!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		try { done(JSON.parse(String(reader.result || "{}"))); }
		catch { alert("That file was not valid JSON."); }
	};
	reader.readAsText(file);
}
