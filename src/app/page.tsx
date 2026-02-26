'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, CheckCircle2, FileText, Timer } from "lucide-react";


enum Status {
    START = 'Start',
    UPLOADING = 'uploading',
    PROCESSING = 'processing',
    SUCCESS = 'success',
    ERROR = 'error',
}
export default function Home() {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [status, setStatus] = useState<Status | null>(Status.START);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<{ pdfUrl: string; executionTime: string } | null>(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            setSelectedFiles(prev => [...prev, ...files]);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const startJob = async () => {
        if (selectedFiles.length === 0) {
            toast.error("Por favor, selecione pelo menos uma imagem.");
            return;
        }

        setLoading(true);
        setResult(null);
        setProgress(0);
        setStatus(Status.UPLOADING);

        const totalChunks = selectedFiles.length + 1; // +1 for PDF generation itself
        let completedChunks = 0;

        try {
            const imageUrls = await Promise.all(
                selectedFiles.map(async (file, index) => {
                    const fileName = `img-${Date.now()}-${index}-${file.name.replace(/\s+/g, '_')}`;
                    const urlRes = await fetch('/api/upload-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileName, contentType: file.type })
                    });

                    if (!urlRes.ok) throw new Error(`Erro ao obter URL de upload para ${file.name}`);

                    const { uploadUrl, publicUrl } = await urlRes.json();

                    const uploadRes = await fetch(uploadUrl, {
                        method: 'PUT',
                        body: file,
                        headers: { 'Content-Type': file.type }
                    });

                    if (!uploadRes.ok) throw new Error(`Erro ao carregar ${file.name}`);

                    completedChunks++;
                    setProgress(Math.round((completedChunks / totalChunks) * 100));

                    return publicUrl;
                })
            );

            setStatus(Status.PROCESSING);

            const res = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrls }),
            });
            const data = await res.json();

            if (res.ok) {
                setProgress(100);
                setResult(data);
                setStatus(Status.SUCCESS);
                toast.success("PDF gerado com sucesso.");
            } else {
                setStatus(Status.ERROR);
                toast.error(data.error || "Erro ao gerar PDF.");
            }
        } catch (error) {
            console.error('[startJob] error', error);
            setStatus(Status.ERROR);
            const message = error instanceof Error ? error.message : "Não foi possível processar o pedido.";
            toast.error(message);

            // Emergency cleanup: delete all images if the flow failed
            fetch('/api/emergency-cleanup', { method: 'POST' }).catch(err =>
                console.error('Failed to trigger emergency cleanup:', err)
            );
        } finally {
            setLoading(false);
        }
    };



    const handleDownload = async () => {
        if (!result) return;

        try {
            // 1. Fetch the file to ensure we have it before deleting
            const response = await fetch(result.pdfUrl);
            const blob = await response.blob();

            // 2. Trigger browser download
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Relatório-Final-${new Date().getTime()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            // 3. Request cleanup from server
            await fetch('/api/cleanup-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: result.pdfUrl })
            });

            toast.info("O PDF foi removido do servidor por segurança.");
            setResult(null); // Clear result as it's no longer available
            setStatus(Status.START);
            setSelectedFiles([]);
        } catch (error) {
            console.error('Download/Cleanup Error:', error);
            toast.error("Erro ao processar o download ou limpeza.");
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 font-sans">
            <main className="max-w-2xl mx-auto space-y-8">
                <header className="text-center space-y-2">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        PDF Generator Pro
                    </h1>
                    <p className="text-slate-400">Gere PDFs profissionais a partir de imagens em segundos.</p>
                </header>

                <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-white">Imagens para o PDF</CardTitle>
                        <CardDescription className="text-slate-400">Selecione as fotos que deseja incluir no documento.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4">
                            {selectedFiles.map((file, index) => (
                                <div key={index} className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700 rounded-lg group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <FileText className="h-5 w-5 text-blue-400 shrink-0" />
                                        <span className="text-sm truncate text-slate-200">{file.name}</span>
                                        <span className="text-xs text-slate-500 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeFile(index)}
                                        className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                                    >
                                        <Loader2 className="h-4 w-4 rotate-45" /> {/* Using Loader2 as a temporary X since I don't see X in imports */}
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <div className="relative group">
                            <Input
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                                id="file-upload"
                            />
                            <label
                                htmlFor="file-upload"
                                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-xl bg-slate-900/30 hover:bg-slate-900/50 hover:border-blue-500/50 transition-all cursor-pointer group"
                            >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <FileText className="h-10 w-10 text-slate-500 group-hover:text-blue-400 transition-colors mb-2" />
                                    <p className="text-sm text-slate-400 group-hover:text-slate-300">Clique para selecionar ou arraste fotos</p>
                                    <p className="text-xs text-slate-500 mt-1">PNG, JPG, WEBP</p>
                                </div>
                            </label>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            onClick={startJob}
                            disabled={loading || selectedFiles.length === 0}
                            className="w-full bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white transition-all duration-300"
                        >
                            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</> : 'Gerar PDF'}
                        </Button>
                    </CardFooter>
                </Card>

                {loading && !result && (
                    <Card className="bg-slate-800/50 border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <CardContent className="pt-6 space-y-4">
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-slate-300 flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                    </span>
                                    Status: {status === Status.UPLOADING ? 'Processando Imagens...' : status === Status.PROCESSING ? 'Aguardando na fila...' : status}
                                </span>
                                <span className="text-blue-400">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2 bg-slate-700" />
                        </CardContent>
                    </Card>
                )}

                {result && (
                    <Card className="bg-emerald-900/20 border-emerald-500/50 animate-in zoom-in-95 duration-500">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div className="space-y-1">
                                <CardTitle className="text-emerald-400 flex items-center gap-2">
                                    <CheckCircle2 className="h-5 w-5" /> Concluído
                                </CardTitle>
                                <CardDescription className="text-emerald-300/70">Seu documento está pronto!</CardDescription>
                            </div>
                            <Timer className="h-8 w-8 text-emerald-500 opacity-50" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-500/10 rounded-md">
                                        <FileText className="h-6 w-6 text-emerald-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">Relatório Final.pdf</p>
                                        <p className="text-xs text-slate-400">Tempo de execução: {result.executionTime}</p>
                                    </div>
                                </div>
                                <Button onClick={handleDownload} className="bg-emerald-600 hover:bg-emerald-700">
                                    Download
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </main>
        </div>
    );
}
