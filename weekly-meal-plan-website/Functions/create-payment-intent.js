// This file should be at: netlify/functions/create-payment-intent.js

// Load the Stripe library with our secret key
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// This function runs when someone tries to pay
exports.handler = async (event, context) => {
  
  // Set up response headers (these tell the browser how to handle the response)
  const headers = {
    'Access-Control-Allow-Origin': '*', // Allow requests from any website
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle "preflight" requests (browser security check)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only accept POST requests (when form is submitted)
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405, // Method not allowed
      headers,
      body: JSON.stringify({ error: 'Only POST requests allowed' }),
    };
  }

  try {
    // First, check if we have our Stripe secret key
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('ERROR: Stripe secret key is missing from environment variables');
      return {
        statusCode: 500, // Server error
        headers,
        body: JSON.stringify({ 
          error: 'Payment system not configured properly' 
        }),
      };
    }

    // Check if we got any data from the form
    if (!event.body) {
      console.log('ERROR: No data received from payment form');
      return {
        statusCode: 400, // Bad request
        headers,
        body: JSON.stringify({ error: 'No payment data received' }),
      };
    }

    // Try to read the payment information from the form
    let paymentData;
    try {
      paymentData = JSON.parse(event.body);
    } catch (error) {
      console.log('ERROR: Could not read payment data:', error.message);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid payment data format' }),
      };
    }

    // Get the information from the form
    const { 
      amount, 
      currency, 
      customer_email, 
      customer_name, 
      product 
    } = paymentData;

    // Check that we have the required customer information
    if (!customer_email || !customer_name) {
      console.log('ERROR: Missing customer information');
      console.log('Email:', customer_email);
      console.log('Name:', customer_name);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Please provide both email and name' 
        }),
      };
    }

    console.log('Creating payment for:', customer_email, 'Amount:', amount);

    // Create the payment with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount || 1000, // Default to $10 AUD (1000 cents)
      currency: currency || 'aud',
      automatic_payment_methods: {
        enabled: true, // Accept cards, digital wallets, etc.
      },
      metadata: {
        customer_email: customer_email,
        customer_name: customer_name,
        product: product || 'weekly-meal-plan',
      },
      receipt_email: customer_email, // Send receipt to customer
      description: `Weekly Meal Plan - ${customer_name}`,
    });

    console.log('SUCCESS: Payment intent created:', paymentIntent.id);

    // Send back the payment information to the website
    return {
      statusCode: 200, // Success
      headers,
      body: JSON.stringify({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      }),
    };

  } catch (error) {
    // If something goes wrong, log the error and send back an error message
    console.log('PAYMENT ERROR:', error.message);
    console.log('Error type:', error.type);
    
    // Handle different types of errors
    if (error.type && error.type.includes('Stripe')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Payment processing error',
          message: error.message 
        }),
      };
    }
    
    // Generic error response
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Something went wrong with the payment',
        message: error.message 
      }),
    };
  }
};
