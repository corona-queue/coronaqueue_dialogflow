'use strict';

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const rp = require('request-promise-native');

 process.env.DEBUG = 'dialogflow:debug';

 function setContextData(agent) {
  const handler = {
    set: function(target, property, value) {
      const parameters = agent.getContext("data")
        ? agent.getContext("data").parameters
        : {};

      parameters[property] = value;

      agent.setContext({name: "data", lifespan: 99, parameters: parameters});
      return true;
    }
  };

  const obj = agent.getContext("data")
    ? agent.getContext("data").parameters
    : {};

  agent.data = new Proxy(obj, handler);

  return agent;
 }

 exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
   const agent = setContextData(new WebhookClient({request, response}));
   console.log('Req headers: ' + JSON.stringify(request.headers));
   console.log('Req body: ' + JSON.stringify(request.body));

   function submitTicket(agent) {
     return rp({
      url: "https://ingress.corona.margau.me/ticket",
      method: "POST", 
      json: {
        meta: {
          firstname: "Max", 
          lastname: "Mustermann",
          phone: "123"
        },
        answers: agent.data.answers
       }
      })
       .then((body) => {
        console.log('Successfully sent ticket! Response: ' + body);
        agent.data.ticketID = body.id;
        agent.add(`Alles klar! Für Rückfragen benutzen sie bitte die Ticket-ID ${agent.data.ticketID}. Wir wünschen einen schönen Tag!`)
        return;
       });
   }

   let intentMap = new Map();
   intentMap.set('A1', (agent) => {
     const age = agent.parameters['age'];
     var option = "q01_option0";
     if (age >= 40 && age <= 50){
       option = "q01_option1";
     } else if (age >= 51 && age <= 60) {
       option = "q01_option2";
     } else if (age >= 61 && age <= 70) {
       option = "q01_option3";
     } else if (age >= 71 && age <= 80) {
       option = "q01_option4";
     } else if (age > 80) {
       option = "q01_option5";
     }
     agent.data['answers'] = {
       "q01": option
     };

     agent.setFollowupEvent('FINISH');
   });
   intentMap.set('Finish - yes', submitTicket);
   agent.handleRequest(intentMap);
 });
