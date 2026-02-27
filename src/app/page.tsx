'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, CheckCircle2, FileText, Timer, X } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";


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

    useEffect(() => {
        if (result) {
            const element = document.getElementById('root');
            if (element) {
                element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
            }
        }
    }, [result]);

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
            toast.info("Processando PDF...");
            const imageUrls = await Promise.all(
                selectedFiles.map(async (file, index) => {
                    const fileName = `img-${Date.now()}-${index}-${file.name.replace(/\s+/g, '_')}`;
                    const { data: urlData } = await axios.post('/api/upload-url', {
                        fileName,
                        contentType: file.type
                    });

                    const { uploadUrl, publicUrl } = urlData;

                    await axios.put(uploadUrl, file, {
                        headers: { 'Content-Type': file.type }
                    });

                    completedChunks++;
                    setProgress(Math.round((completedChunks / totalChunks) * 100));

                    return publicUrl;
                })
            );

            setStatus(Status.PROCESSING);

            const { data: jobData } = await axios.post('/api/jobs', { imageUrls });

            setProgress(100);
            setResult(jobData);
            setStatus(Status.SUCCESS);
            toast.success("PDF gerado com sucesso.");
        } catch (error) {
            console.error('[startJob] error', error);
            setStatus(Status.ERROR);

            let message = "Não foi possível processar o pedido.";
            if (axios.isAxiosError(error) && error.response?.data?.error) {
                message = error.response.data.error;
            } else if (error instanceof Error) {
                message = error.message;
            }

            toast.error(message);

            axios.post('/api/emergency-cleanup').catch(err =>
                console.error('Failed to trigger emergency cleanup:', err)
            );
        } finally {
            setLoading(false);
        }
    };



    const handleDownload = async () => {
        if (!result) return;

        try {
            try {
                const { data: blob } = await axios.get(result.pdfUrl, { responseType: 'blob' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `Relatório-Final-${new Date().getTime()}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (downloadErr) {
                console.error('Download Error (likely CORS):', downloadErr);
                toast.warning("Erro ao descarregar com nome personalizado. A abrir link direto...");
                window.open(result.pdfUrl, '_blank');
            }

            try {
                await axios.post('/api/cleanup-pdf', { url: result.pdfUrl });
                toast.info("O PDF foi removido do servidor por segurança.");
            } catch (cleanupErr) {
                console.error('Cleanup Error:', cleanupErr);
                toast.warning("O PDF foi descarregado, mas a limpeza automática falhou.");
            }

            setResult(null);
            setStatus(Status.START);
            setSelectedFiles([]);
        } catch (error) {
            console.error('General Error in downloadResult:', error);
            toast.error("Ocorreu um erro inesperado.");
        }
    };

    return (
        <div className="min-h-screen bg-white text-slate-900 p-8 font-sans" id="root">
            <main className="max-w-2xl mx-auto space-y-8">
                <header className="text-center space-y-2">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-emerald-600">
                        PDF Generator Pro
                    </h1>
                    <p className="text-slate-500">Gere PDFs profissionais a partir de imagens em segundos.</p>
                </header>

                <Card className="bg-white border-slate-200 shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-slate-900">Imagens para o PDF</CardTitle>
                        <CardDescription className="text-slate-500">Selecione as fotos que deseja incluir no documento.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4">
                            {selectedFiles.map((file, index) => (
                                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <FileText className="h-5 w-5 text-blue-400 shrink-0" />
                                        <span className="text-primary text-sm truncate">{file.name}</span>
                                        <span className="text-primary text-xs text-slate-500 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeFile(index)}
                                        className="h-8 w-8 text-primary hover:text-red-500 hover:bg-red-50"
                                    >
                                        <X className="h-4 w-4" />
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
                                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 hover:border-blue-400 transition-all cursor-pointer group"
                            >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <FileText className="h-10 w-10 text-slate-400 group-hover:text-blue-500 transition-colors mb-2" />
                                    <p className="text-sm text-slate-500 group-hover:text-slate-600">Clique para selecionar ou arraste fotos</p>
                                    <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP</p>
                                </div>
                            </label>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            variant="secondary"
                            onClick={startJob}
                            disabled={loading || selectedFiles.length === 0}
                            className="w-full bg-primary hover:bg-primary/70 text-white transition-all duration-300"
                        >
                            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</> : 'Gerar PDF'}
                        </Button>
                    </CardFooter>
                </Card>

                <Dialog open={loading || !!result} onOpenChange={(open) => {
                    if (!open && !loading) setResult(null);
                }}>
                    <DialogContent className="sm:max-w-md bg-white border-blue-100">
                        {loading && !result ? (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="text-blue-700 flex items-center gap-2 text-2xl">
                                        <Loader2 className="h-6 w-6 animate-spin" /> Processando
                                    </DialogTitle>
                                    <DialogDescription className="text-slate-500 text-base">
                                        Estamos a preparar o seu documento. Por favor, aguarde um momento.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-6">
                                    <div className="flex justify-between items-center text-sm font-medium">
                                        <span className="text-slate-600">
                                            Status: {status === Status.UPLOADING ? 'A preparar imagens...' : 'A gerar PDF...'}
                                        </span>
                                        <span className="text-blue-600">{progress}%</span>
                                    </div>
                                    <Progress value={progress} className="h-2 bg-blue-50" />
                                </div>
                            </>
                        ) : result ? (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="text-emerald-700 flex items-center gap-2 text-2xl">
                                        <CheckCircle2 className="h-6 w-6" /> Concluído
                                    </DialogTitle>
                                    <DialogDescription className="text-slate-500 text-base">
                                        O seu documento foi gerado com sucesso e está pronto para download.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-6 py-4">
                                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100 shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-white rounded-lg shadow-sm">
                                                <FileText className="h-8 w-8 text-emerald-600" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold text-slate-900">Relatório Final.pdf</p>
                                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                                    <Timer className="h-3 w-3" />
                                                    <span>Tempo: {result?.executionTime}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <DialogFooter className="sm:justify-start gap-3">
                                    <Button
                                        onClick={handleDownload}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg py-6 text-lg font-semibold transition-all hover:scale-[1.02]"
                                    >
                                        <FileText className="mr-2 h-5 w-5" /> Descarregar PDF
                                    </Button>
                                </DialogFooter>
                            </>
                        ) : null}
                    </DialogContent>
                </Dialog>
            </main>
        </div>
    );
}
