import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { runWithToast } from '../../../lib/toast';
import { StarRating } from './StarRating';
import {
    useSubmitBuyerRating,
    useSubmitSupplierRating,
    useUpdateBuyerRating,
    useUpdateSupplierRating
} from '../hooks';
import type {
    BuyerRatingDto,
    NewBuyerRatingPayload,
    NewSupplierRatingPayload,
    SupplierRatingDto
} from '../types';

type Mode = 'supplier' | 'buyer';

interface RatingComposerProps {
    open: boolean;
    mode: Mode;
    /** sellerId when mode='supplier', buyerId when mode='buyer'. */
    subjectId: number;
    /** Display name shown in the modal header. */
    subjectName?: string;
    purchaseOrderId?: number;
    /** Existing rating, when editing. */
    existing?: SupplierRatingDto | BuyerRatingDto | null;
    onClose: () => void;
    onSubmitted?: () => void;
}

const fieldLabel = 'text-[10px] font-black uppercase tracking-widest text-slate-500';

export function RatingComposer(props: RatingComposerProps) {
    const { open, mode, subjectId, subjectName, purchaseOrderId, existing, onClose, onSubmitted } = props;

    const [overall, setOverall] = useState(5);
    const [primary, setPrimary] = useState(5);
    const [secondary, setSecondary] = useState(5);
    const [communication, setCommunication] = useState(5);
    const [review, setReview] = useState('');

    const submitSupplier = useSubmitSupplierRating();
    const submitBuyer = useSubmitBuyerRating();
    const updateSupplier = useUpdateSupplierRating(subjectId);
    const updateBuyer = useUpdateBuyerRating(subjectId);

    // Sync form state with the existing rating when the modal opens.
    useEffect(() => {
        if (!open) return;
        if (existing) {
            setOverall(existing.rating || 5);
            setReview(existing.review || '');
            if (mode === 'supplier') {
                const e = existing as SupplierRatingDto;
                setPrimary(e.qualityScore || 5);
                setSecondary(e.deliveryScore || 5);
                setCommunication(e.communicationScore || 5);
            } else {
                const e = existing as BuyerRatingDto;
                setPrimary(e.paymentTimelinessScore || 5);
                setSecondary(0);
                setCommunication(e.communicationScore || 5);
            }
        } else {
            setOverall(5);
            setPrimary(5);
            setSecondary(5);
            setCommunication(5);
            setReview('');
        }
    }, [open, existing, mode]);

    if (!open) return null;

    const isEditing = !!existing;
    const submitting =
        submitSupplier.isPending || submitBuyer.isPending || updateSupplier.isPending || updateBuyer.isPending;

    const submit = async () => {
        if (overall < 1) return;
        if (mode === 'supplier') {
            const payload: NewSupplierRatingPayload = {
                sellerId: subjectId,
                purchaseOrderId,
                rating: overall,
                review: review.trim() || undefined,
                qualityScore: primary,
                deliveryScore: secondary,
                communicationScore: communication
            };
            await runWithToast(
                () => isEditing
                    ? updateSupplier.mutateAsync({ id: (existing as SupplierRatingDto).id, data: payload })
                    : submitSupplier.mutateAsync(payload),
                {
                    loading: isEditing ? 'Updating rating...' : 'Submitting rating...',
                    success: isEditing ? 'Rating updated' : 'Thanks - your rating is in',
                    error: err => (err instanceof Error ? err.message : 'Failed to submit rating')
                }
            );
        } else {
            const payload: NewBuyerRatingPayload = {
                buyerId: subjectId,
                purchaseOrderId,
                rating: overall,
                review: review.trim() || undefined,
                paymentTimelinessScore: primary,
                communicationScore: communication
            };
            await runWithToast(
                () => isEditing
                    ? updateBuyer.mutateAsync({ id: (existing as BuyerRatingDto).id, data: payload })
                    : submitBuyer.mutateAsync(payload),
                {
                    loading: isEditing ? 'Updating rating...' : 'Submitting rating...',
                    success: isEditing ? 'Rating updated' : 'Thanks - your rating is in',
                    error: err => (err instanceof Error ? err.message : 'Failed to submit rating')
                }
            );
        }
        onSubmitted?.();
        onClose();
    };

    const primaryLabel = mode === 'supplier' ? 'Product / service quality' : 'Payment timeliness';
    const secondaryLabel = mode === 'supplier' ? 'Delivery on time' : null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-label="Rate this transaction"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl animate-in zoom-in-95 duration-200">
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">
                            {isEditing ? 'Edit rating' : 'Rate this transaction'}
                        </p>
                        <h2 className="mt-1 text-base font-black text-slate-950">
                            {mode === 'supplier' ? 'How did the seller do?' : 'How was the buyer to work with?'}
                        </h2>
                        {subjectName && (
                            <p className="mt-1 text-xs font-semibold text-slate-500">{subjectName}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="space-y-5 p-5">
                    <div className="space-y-2">
                        <p className={fieldLabel}>Overall rating</p>
                        <StarRating value={overall} onChange={setOverall} size="lg" />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <p className={fieldLabel}>{primaryLabel}</p>
                            <StarRating value={primary} onChange={setPrimary} />
                        </div>
                        {secondaryLabel && (
                            <div className="space-y-1">
                                <p className={fieldLabel}>{secondaryLabel}</p>
                                <StarRating value={secondary} onChange={setSecondary} />
                            </div>
                        )}
                        <div className="space-y-1">
                            <p className={fieldLabel}>Communication</p>
                            <StarRating value={communication} onChange={setCommunication} />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <p className={fieldLabel}>Written feedback (optional)</p>
                        <textarea
                            value={review}
                            onChange={e => setReview(e.target.value)}
                            maxLength={2000}
                            rows={4}
                            placeholder="What stood out? What could be improved?"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                        />
                        <p className="text-[10px] font-bold text-slate-400">{review.length}/2000</p>
                    </div>
                </div>

                <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={submitting || overall < 1}
                        className="bg-[#12335f] text-white hover:bg-[#0e2a4f]"
                    >
                        {isEditing ? 'Update rating' : 'Submit rating'}
                    </Button>
                </footer>
            </div>
        </div>
    );
}
