import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, Mail, MessageSquare } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { cn } from './ui/utils';

interface FeedbackFormProps {
  accessToken?: string | null;
  variant?: 'card' | 'plain';
  className?: string;
}

interface FeedbackState {
  name: string;
  email: string;
  rating: string;
  message: string;
}

const initialState: FeedbackState = {
  name: '',
  email: '',
  rating: '',
  message: '',
};

export function FeedbackForm({ accessToken, variant = 'card', className }: FeedbackFormProps) {
  const [form, setForm] = useState<FeedbackState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const updateField = (key: keyof FeedbackState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedMessage = form.message.trim();
    if (!trimmedMessage) {
      setError('Please share a brief note so we know how to improve.');
      return;
    }

    const ratingNumber = Number(form.rating);
    const payload = {
      name: form.name.trim() || undefined,
      email: form.email.trim() || undefined,
      message: trimmedMessage,
      rating: Number.isFinite(ratingNumber) && ratingNumber >= 1 && ratingNumber <= 5 ? ratingNumber : undefined,
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : { Authorization: `Bearer ${publicAnonKey}` }),
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || 'We could not send your feedback. Please try again.');
      }

      setSuccess(result?.message || 'Thank you for the feedback!');
      setForm(initialState);
    } catch (err: any) {
      console.error('Feedback submission error:', err);
      setError(err.message || 'We could not send your feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <form className={cn('space-y-4', className)} onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="feedback-name">Name (optional)</Label>
          <Input
            id="feedback-name"
            placeholder="Jane Doe"
            value={form.name}
            onChange={updateField('name')}
            autoComplete="name"
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="feedback-email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email (optional)
          </Label>
          <Input
            id="feedback-email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={updateField('email')}
            autoComplete="email"
            maxLength={160}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-rating">How are we doing? (1-5)</Label>
        <Input
          id="feedback-rating"
          type="number"
          min={1}
          max={5}
          step={1}
          placeholder="5"
          value={form.rating}
          onChange={updateField('rating')}
        />
        <p className="text-xs text-muted-foreground">5 means outstanding, 1 means needs improvement.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-message">Share your thoughts</Label>
        <Textarea
          id="feedback-message"
          placeholder="Tell us about your experience..."
          value={form.message}
          onChange={updateField('message')}
          rows={4}
          maxLength={1000}
          required
        />
        <p className="text-xs text-muted-foreground">Include feature requests, bugs, or anything else on your mind.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            'Send feedback'
          )}
        </Button>
      </div>
    </form>
  );

  if (variant === 'plain') {
    return formContent;
  }

  return (
    <Card className="shadow-sm border-muted">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageSquare className="h-5 w-5 text-green-600" />
          We'd love your feedback
        </CardTitle>
        <CardDescription>
          Tell us what's working well or what could be better. Your input helps us shape CleanEats.
        </CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
