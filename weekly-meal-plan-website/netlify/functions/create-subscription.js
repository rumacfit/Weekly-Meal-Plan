// netlify/functions/create-subscription.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Only POST requests allowed' }),
    };
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('ERROR: Stripe secret key is missing');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Payment system not configured properly' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No subscription data received' }),
      };
    }

    const { customer_email, customer_name, payment_method_id } = JSON.parse(event.body);

    if (!customer_email || !customer_name || !payment_method_id) {
      console.log('Missing required fields:', { customer_email, customer_name, payment_method_id });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    console.log('Creating subscription for:', customer_email);

    // Create customer
    let customer;
    try {
      const existingCustomers = await stripe.customers.list({
        email: customer_email,
        limit: 1
      });
      
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
        console.log('Found existing customer:', customer.id);
        
        // Attach payment method to existing customer
        await stripe.paymentMethods.attach(payment_method_id, {
          customer: customer.id,
        });
        
        // Update default payment method
        await stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: payment_method_id,
          },
        });
      } else {
        // Create new customer
        customer = await stripe.customers.create({
          email: customer_email,
          name: customer_name,
          payment_method: payment_method_id,
          invoice_settings: {
            default_payment_method: payment_method_id,
          },
        });
        console.log('Created new customer:', customer.id);
      }
    } catch (error) {
      console.error('Error with customer:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to set up customer account',
          message: error.message 
        }),
      };
    }

    // Create subscription with inline price for $10 AUD promotional rate
    try {
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'Weekly Meal Plan (Promotional Rate)',
            },
            unit_amount: 1000, // $10 AUD in cents
            recurring: {
              interval: 'week',
            },
          },
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: { 
          save_default_payment_method: 'on_subscription' 
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          customer_email: customer_email,
          customer_name: customer_name,
          plan_type: 'weekly-meal-plan',
          promotional_weeks_used: '0',
          promotional_weeks_total: '4',
          regular_price_amount: '2000', // $20 AUD for later
        },
      });

      console.log('SUCCESS: Subscription created:', subscription.id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          subscription_id: subscription.id,
          client_secret: subscription.latest_invoice.payment_intent.client_secret,
          customer_id: customer.id,
        }),
      };

    } catch (error) {
      console.error('Error creating subscription:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to create subscription',
          message: error.message 
        }),
      };
    }

  } catch (error) {
    console.error('SUBSCRIPTION ERROR:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Something went wrong with the subscription',
        message: error.message 
      }),
    };
  }
};
