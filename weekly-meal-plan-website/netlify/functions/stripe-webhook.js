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
        
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          
          // Check if this is a promotional subscription
          if (subscription.metadata.promotional_weeks_used !== undefined) {
            const weeksUsed = parseInt(subscription.metadata.promotional_weeks_used) + 1;
            const totalPromotionalWeeks = parseInt(subscription.metadata.promotional_weeks_total) || 4;
            
            console.log(`Subscription ${subscription.id}: Week ${weeksUsed} of ${totalPromotionalWeeks} promotional weeks`);
            
            if (weeksUsed >= totalPromotionalWeeks) {
              // Switch to regular pricing
              console.log(`Switching subscription ${subscription.id} to regular pricing`);
              
              await stripe.subscriptions.update(subscription.id, {
                items: [{
                  id: subscription.items.data[0].id,
                  price_data: {
                    currency: 'aud',
                    product_data: {
                      name: 'Weekly Meal Plan',
                      description: 'Regular weekly meal plan',
                    },
                    unit_amount: 2000, // $20 AUD
                    recurring: {
                      interval: 'week',
                    },
                  },
                }],
                metadata: {
                  ...subscription.metadata,
                  promotional_weeks_used: null,
                  promotional_weeks_total: null,
                  price_tier: 'regular',
                },
              });
              
              console.log(`Successfully switched subscription ${subscription.id} to regular pricing`);
            } else {
              // Update the promotional weeks counter
              await stripe.subscriptions.update(subscription.id, {
                metadata: {
                  ...subscription.metadata,
                  promotional_weeks_used: weeksUsed.toString(),
                },
              });
              
              console.log(`Updated promotional week counter for subscription ${subscription.id}: ${weeksUsed}/${totalPromotionalWeeks}`);
            }
          }
        }
        break;
        
      case 'customer.subscription.deleted':
        console.log('Subscription cancelled:', stripeEvent.data.object.id);
        // Add any cleanup logic here if needed
        break;
        
      case 'invoice.payment_failed':
        const failedInvoice = stripeEvent.data.object;
        console.log('Payment failed for subscription:', failedInvoice.subscription);
        // Add failed payment handling logic here
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