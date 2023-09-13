const express = require('express');
const fs = require('fs')
const bodyParser = require('body-parser');

const app = express();
const port = 5000;

const HttpError = require('./models/http-error');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname)); // Serve static files from the current directory

// Function to calculate cosine similarity between two vectors
function calculateCosineSimilarity(vector1, vector2) {
    const totalQuestions = 20;
    const numOptions = 10;
    // Calculate dot product and magnitudes
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < totalQuestions; i++) {
        for (let j = 0; j < numOptions; j++) {
        dotProduct += vector1[i][j] * vector2[i][j];
        magnitude1 += vector1[i][j] * vector1[i][j];
        magnitude2 += vector2[i][j] * vector2[i][j];
        }
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    // Calculate cosine similarity
    if (magnitude1 === 0 || magnitude2 === 0) {
        return 0; // Prevent division by zero
    } 
    const similarity = dotProduct / (magnitude1 * magnitude2);

    // Convert similarity to percentage
    const similarityPercentage = (similarity * 100).toFixed(2);

    return similarityPercentage;
}

function calculateSimilarity(response1, response2) {
    const totalQuestions = 20;
    const numOptions = 10;
    
    // Initialize a 2D vector with zeros
    const candidate1_res = Array.from({ length: totalQuestions }, () => Array(numOptions).fill(0));
    const candidate2_res = Array.from({ length: totalQuestions }, () => Array(numOptions).fill(0));

    for (const response of response1.responses) {
        const questionIndex = parseInt(response.question.split(' ')[1]) - 1;
        const optionIndex = parseInt(response.option.split(' ')[1]) - 1;
    
        if (!isNaN(questionIndex) && !isNaN(optionIndex)) {
            candidate1_res[questionIndex][optionIndex] = 1;
        }
    }

    for (const response of response2.responses) {
        const questionIndex = parseInt(response.question.split(' ')[1]) - 1;
        const optionIndex = parseInt(response.option.split(' ')[1]) - 1;
    
        if (!isNaN(questionIndex) && !isNaN(optionIndex)) {
            candidate2_res[questionIndex][optionIndex] = 1;
        }
    }

  
    // Calculate cosine similarity between the two vectors
    const similarity = calculateCosineSimilarity(candidate1_res, candidate2_res);
    
    return similarity +"%";
}

let surveyResponses = [];
// Read the survey responses from the JSON file
fs.readFile('survey_responses.json', 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
      return;
    }

    // Parse the JSON data to an array
    surveyResponses = JSON.parse(data);
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/allSurveys', (req, res) => {
    res.json(surveyResponses);
});

app.get('/survey', (req, res) => {
    res.sendFile(__dirname + '/survey.html');
});

app.post('/submit', (req, res) => {
    const candidateName = req.body.candidateName;

    const numQuestions = 20; // Number of questions
    const responses = [];
  
    // Loop through the questions and extract the selected options
    for (let i = 1; i <= numQuestions; i++) {
      const question = `q${i}`;
      const selectedOption = req.body[question];
  
      if (selectedOption !== undefined) {
        // Only include questions that the user has answered (not left blank)
        responses.push({
          question: `Question ${i}`,
          option: `Option ${selectedOption}`,
        });
      }
    }
  
    // Store the candidate name and responses in the surveyResponses array
    surveyResponses.push({
        candidateName: candidateName,
        responses: responses,
    });
  
    // Append the responses to a file
    const responseData = JSON.stringify(surveyResponses, null, 2); // Convert responses to JSON format
    fs.writeFile('survey_responses.json', responseData, (err) => {
        if (err) {
        console.error('Error appending responses to file:', err);
        // Handle the error here
        } else {
        console.log('Responses appended to file successfully.');
        // Redirect to a thank-you page or display a confirmation message
        res.send('Thank you for submitting the survey!');
        }
    });      
});


app.post('/filter', (req, res) => {
    const candidateName = req.body.candidateName;
  
    const targetCandidate = surveyResponses.find((candidate) => candidate.candidateName === candidateName);
    if (!targetCandidate) {
        const error = new HttpError('Candidate not found', 404);
        throw error;
    }
  
    const similarityResults = [];
  
    for (const candidate of surveyResponses) {
      if (candidate.candidateName !== candidateName) {
        const similarity = calculateSimilarity(targetCandidate, candidate);

        similarityResults.push({
            targetCandidate: candidateName,
            otherCandidate: candidate.candidateName,
            similarity: similarity,
        });
      }
    }
  
    similarityResults.sort((a, b) => b.similarity - a.similarity);
  
    // Format the response as user-readable JSON
    const formattedResponse = similarityResults.map((entry) => ({
        Candidates: `${entry.targetCandidate} and ${entry.otherCandidate}`,
        SimilarityScore: entry.similarity,
    }));
    res.json(formattedResponse);
});

app.post('/searchQuery', (req, res) => {
    const searchText = req.body.query;
    const searchResults = [];

  // Calculate similarity for all pairs of candidates
  for (let i = 0; i < surveyResponses.length; i++) {
    for (let j = i + 1; j < surveyResponses.length; j++) {
      const candidate1 = surveyResponses[i];
      const candidate2 = surveyResponses[j];

      // Check if either search textcontains the candidate's name (case-insensitive)
      if (
        searchText.toLowerCase().includes(candidate1.candidateName.toLowerCase()) &&
        searchText.toLowerCase().includes(candidate2.candidateName.toLowerCase())
      ) {
        const similarity = calculateSimilarity(candidate1, candidate2);
        
        searchResults.push({
          candidate1: candidate1.candidateName,
          candidate2: candidate2.candidateName,
          similarity: similarity,
        });
      }
    }
  }
  
  res.json(searchResults);
  
});

// http://localhost:5000/similarity
// http://localhost:5000/similarity?page=2
app.get('/similarity', (req, res) => {
    const page = parseInt(req.query.page) || 1; // Current page number
    const pageSize = 5; // Number of results per page

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const totalCandidates = surveyResponses.length;

    // Ensure pagination bounds
    if (startIndex >= totalCandidates) {
        const error = new HttpError('Candidate not found', 404);
        throw error;
    }

    const similarityMatrix = [];
  
    // Iterate through all pairs of candidates
    for (let i = startIndex; i < endIndex && i < totalCandidates; i++) {
      for (let j = i + 1; j < totalCandidates; j++) {
        const candidate1 = surveyResponses[i];
        const candidate2 = surveyResponses[j];
  
        // Calculate similarity (replace this with your similarity calculation function)
        const similarityScore = calculateSimilarity(candidate1,candidate2);
  
        // Store the similarity score and candidate names in the matrix
        similarityMatrix.push({
          candidate1: candidate1.candidateName,
          candidate2: candidate2.candidateName,
          similarity: similarityScore,
        });
      }
    }

    // Format the response as user-readable JSON
    const formattedResponse = similarityMatrix.map((entry) => ({
        Candidates: `${entry.candidate1} and ${entry.candidate2}`,
        SimilarityScore: entry.similarity,
    }));

    // Respond with the user-friendly JSON
    res.json(formattedResponse);
});

app.use((req, res, next) => {
    const error = new HttpError('Could not find this route.', 404);
    throw error;
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});