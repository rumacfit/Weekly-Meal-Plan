// netlify/functions/stripe-webhook.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Only POST requests allowed' }),
    };
  }

  const sig = event.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed:`, err.message);
    return {
      statusCode: 400,
      headers,
      body: `Webhook Error: ${err.message}`
    };
  }

  console.log('Webhook event received:', stripeEvent.type);

  try {
    switch (stripeEvent.type) {
      case 'invoice.payment_succeeded':
        const invoice = stripeEvent.data.object;
        console.log('Payment succeeded for subscription:', invoice.subscription);
        // Add any success handling logic here (e.g., send welcome email, grant access)
        break;
        
      case 'customer.subscription.deleted':
        console.log('Subscription cancelled:', stripeEvent.data.object.id);
        // Add any cleanup logic here (e.g., revoke access, send cancellation email)
        break;
        
      case 'invoice.payment_failed':
        const failedInvoice = stripeEvent.data.object;
        console.log('Payment failed for subscription:', failedInvoice.subscription);
        // Add failed payment handling logic here (e.g., send payment reminder email)
        break;
        
      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true })
    };

  } catch (error) {
    console.error('Webhook processing error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Webhook processing failed' })
    };
  }
};
