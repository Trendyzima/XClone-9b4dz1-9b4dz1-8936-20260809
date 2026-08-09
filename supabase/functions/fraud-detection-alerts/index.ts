import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Fraud Detection Alerts - Runs every hour
 * 
 * Detects suspicious patterns:
 * - High click rates (>50 clicks/hour)
 * - Repeated clicks from same user
 * - Bot-like behavior
 * - IP fraud patterns
 * 
 * Actions:
 * - Create fraud alert
 * - Send email notification to admins
 * - Auto-block critical threats
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Running fraud detection...');

    // Run fraud detection function
    const { data: detectionResult, error: detectionError } = await supabaseClient
      .rpc('detect_fraud_patterns');

    if (detectionError) {
      throw detectionError;
    }

    console.log('Fraud detection result:', detectionResult);

    // Get new unresolved fraud alerts
    const { data: newAlerts, error: alertsError } = await supabaseClient
      .from('fraud_alerts')
      .select(`
        *,
        user_profiles(username, email)
      `)
      .eq('resolved', false)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour

    if (alertsError) {
      throw alertsError;
    }

    console.log(`Found ${newAlerts?.length || 0} new fraud alerts`);

    // Group alerts by severity
    const criticalAlerts = newAlerts?.filter(a => a.severity === 'critical') || [];
    const highAlerts = newAlerts?.filter(a => a.severity === 'high') || [];
    const mediumAlerts = newAlerts?.filter(a => a.severity === 'medium') || [];

    // Send email notification to admins if there are critical/high alerts
    if (criticalAlerts.length > 0 || highAlerts.length > 0) {
      await sendAdminNotification(criticalAlerts, highAlerts, mediumAlerts);
    }

    // Auto-block users with critical alerts
    for (const alert of criticalAlerts) {
      if (alert.auto_action === 'blocked' && alert.user_id) {
        await supabaseClient
          .from('user_profiles')
          .update({ is_blocked: true })
          .eq('id', alert.user_id);
        
        console.log(`Auto-blocked user ${alert.user_id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        new_alerts: detectionResult.new_alerts,
        critical: criticalAlerts.length,
        high: highAlerts.length,
        medium: mediumAlerts.length,
        auto_blocked: criticalAlerts.filter(a => a.auto_action === 'blocked').length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Fraud detection error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function sendAdminNotification(critical: any[], high: any[], medium: any[]) {
  // In production, integrate with SendGrid, Resend, or other email service
  const emailContent = `
    🚨 FRAUD ALERT NOTIFICATION
    
    Critical Alerts: ${critical.length}
    High Priority: ${high.length}
    Medium Priority: ${medium.length}
    
    Critical Alerts:
    ${critical.map(a => `
      - User: ${a.user_profiles?.username || 'Unknown'}
      - Type: ${a.alert_type}
      - Details: ${JSON.stringify(a.details)}
      - Action Taken: ${a.auto_action}
    `).join('\n')}
    
    Please review and take action in the admin dashboard.
  `;

  console.log('Email notification:', emailContent);
  
  // TODO: Send actual email
  // await fetch('https://api.sendgrid.com/v3/mail/send', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     personalizations: [{
  //       to: [{ email: 'nahashonnyaga794@gmail.com' }],
  //       subject: '🚨 Fraud Detection Alert - T Social'
  //     }],
  //     from: { email: 'alerts@tsocial.com' },
  //     content: [{
  //       type: 'text/plain',
  //       value: emailContent
  //     }]
  //   })
  // });
}
