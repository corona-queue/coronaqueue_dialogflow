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
    const options = {
      url: "https://ingress.corona.margau.me/ticket",
      method: "POST", 
      json: {
        meta: {
          firstname: "Max", 
          lastname: "Mustermann",
          phone: '123'
        },
        answers: agent.data.answers
      }
    };
    console.log(JSON.stringify(options.json))
    return rp(options)
      .then((body) => {
        console.log('Successfully sent ticket! Response: ' + JSON.stringify(body));
        agent.data.ticketID = body.id;
        agent.add(`Alles klar! Für Rückfragen zu Ihrer Position in der Warteschlange benutzen sie bitte die Ticket-ID ${agent.data.ticketID}. Wir wünschen einen schönen Tag!`)
        return;
      });
  }

  // null for complicated questions with custom handling
  const questions = [
    null,
    {count: 2},
    {count: 3},
    {count: 2, followups: ['Q7', 'Q7']},
    null,
    null,
    {count: 2, followups: ['Q8', 'FINISH']},
    null
  ]

  let intentMap = new Map();

  // Save phone number for ticket
  intentMap.set('Q1', (agent) => {
    // const phone = agent.parameters["#WELCOME.phone"] || '123';
    // console.log(JSON.stringify(agent.contexts));
    // agent.data['phone'] = phone;
    agent.data['answers'] = {};
  })

  // e.g. Q2 has answers A2a, A2b etc. with `option` parameter corresponding to result
  questions.forEach((question, i) => {
    if (question !== null) {
      for(var j=0; j < question.count; j++){
        const optIdx = j; 
        const optionChar = String.fromCharCode(97 + optIdx);
        intentMap.set('A' + (i + 1) + optionChar, (agent) => {
          const answerkey = (i + 1) >= 10 ? `q${i+1}` : `q0${i+1}`; 

          var answers = agent.data.answers;
          answers[answerkey] = agent.parameters['option'];
          agent.data.answers = answers;

          var nextEvent = 'FINISH';
          if ((i + 1) < questions.length) {
            nextEvent = (question.followups ? question.followups[optIdx] : 'Q' + (i + 2));
            console.log('followups[' + optIdx + ']: ' + JSON.stringify(question.followups));
          }
          console.log('next event ' + nextEvent);
          agent.setFollowupEvent(nextEvent);
        });
      }
    }
  })

  // Special handling
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

    agent.setFollowupEvent('Q2');
  });

  intentMap.set('A8a', (agent) => {
    const country = agent.parameters['country'];
    var option = "q08_option8";
    const country_mapping = {
      'Italien': 'q08_option0',
      'Iran': 'q08_option1',
      'China': 'q08_option2',
      'Südkorea': 'q08_option3',
      'Frankreich': 'q08_option4',
      'Österreich': 'q08_option5',
      'Spanien': 'q08_option6',
      'USA': 'q08_option7'
    }
    if (country in country_mapping){
      option = country_mapping[country];
    }

    var answers = agent.data.answers;
    answers['q08'] = option;
    agent.data.answers = answers;

    agent.setFollowupEvent('FINISH');
  });

  intentMap.set('Finish - yes', submitTicket);
  agent.handleRequest(intentMap);
});
