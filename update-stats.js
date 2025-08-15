import { Octokit } from '@octokit/rest';
import fs from 'fs';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const username = process.env.GITHUB_ACTOR;


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getGitHubStats() {
  try {
    console.log('Fetching user data...');
    const { data: user } = await octokit.rest.users.getByUsername({
      username: username
    });

    let allRepos = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
      const { data: repos } = await octokit.rest.repos.listForUser({
        username: username,
        type: 'owner',
        per_page: perPage,
        page: page,
        sort: 'updated'
      });
      
      allRepos = [...allRepos, ...repos];
      
      if (repos.length < perPage) break;
      page++;
      
      await delay(100);
    }

    console.log(`Found ${allRepos.length} repositories`);

    const stats = {
      totalRepos: allRepos.length,
      totalStars: allRepos.reduce((acc, repo) => acc + repo.stargazers_count, 0),
      totalForks: allRepos.reduce((acc, repo) => acc + repo.forks_count, 0),
      followers: user.followers,
      following: user.following,
      publicRepos: user.public_repos,
      totalSize: allRepos.reduce((acc, repo) => acc + repo.size, 0)
    };

    const topRepos = allRepos
      .filter(repo => !repo.fork && repo.language) 
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 20);

    console.log(`Analyzing languages from ${topRepos.length} top repositories...`);

    const languages = {};
    for (const [index, repo] of topRepos.entries()) {
      try {
        const { data: repoLanguages } = await octokit.rest.repos.listLanguages({
          owner: username,
          repo: repo.name
        });
        
        Object.entries(repoLanguages).forEach(([lang, bytes]) => {
          languages[lang] = (languages[lang] || 0) + bytes;
        });

        if (index % 5 === 0) await delay(200);
        
      } catch (error) {
        console.log(`Error fetching languages for ${repo.name}:`, error.message);
      }
    }

    const sortedLanguages = Object.entries(languages)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8);  

    const recentRepos = allRepos
      .filter(repo => !repo.fork)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5);

    console.log('Statistics generated successfully!');
    
    return { 
      stats, 
      sortedLanguages, 
      recentRepos,
      requestsUsed: 1 + Math.ceil(allRepos.length / 100) + topRepos.length 
    };

  } catch (error) {
    console.error('Error fetching GitHub stats:', error);
    return null;
  }
}

function generateLanguageBar(languages) {
  const totalBytes = languages.reduce((acc, [, bytes]) => acc + bytes, 0);
  
  return languages.map(([lang, bytes]) => {
    const percentage = ((bytes / totalBytes) * 100).toFixed(1);
    const barLength = Math.round((bytes / totalBytes) * 25);
    const bar = '█'.repeat(barLength) + '░'.repeat(25 - barLength);
    return `${lang.padEnd(15)} ${bar} ${percentage}%`;
  }).join('\n');
}

async function updateReadme() {
  const startTime = Date.now();
  const githubStats = await getGitHubStats();
  
  if (!githubStats) {
    console.log('Failed to fetch GitHub stats');
    return;
  }

  const { stats, sortedLanguages, recentRepos, requestsUsed } = githubStats;
  const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

  const languageBar = generateLanguageBar(sortedLanguages);
  const lastUpdated = new Date().toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const recentActivity = recentRepos.map(repo => 
    `- 🔨 [${repo.name}](${repo.html_url}) - ${repo.description || 'No description'} (${repo.language || 'No language'})`
  ).join('\n');

  const readmeContent = `# Hi there! 👋

## 📊 GitHub Statistics

### 📈 Overview
\`\`\`
🔭 Repositories         ${stats.totalRepos}
⭐ Stars Received       ${stats.totalStars}  
🍴 Forks               ${stats.totalForks}
👥 Followers           ${stats.followers}
📦 Repository Size     ${(stats.totalSize / 1024).toFixed(1)} MB
\`\`\`

### 💻 Most Used Languages

\`\`\`
${languageBar}
\`\`\`

### 🚀 Recent Activity

${recentActivity}

### 🎯 Quick Stats
![Repositories](https://img.shields.io/badge/Repositories-${stats.totalRepos}-blue?style=flat-square)
![Stars](https://img.shields.io/badge/Stars-${stats.totalStars}-yellow?style=flat-square)
![Followers](https://img.shields.io/badge/Followers-${stats.followers}-green?style=flat-square)

---

<div align="center">
  <sub>
    🤖 This README updates automatically every day<br/>
    📅 Last updated: ${lastUpdated} UTC
  </sub>
</div>
`;

  fs.writeFileSync('README.md', readmeContent);
  console.log(`✅ README.md updated successfully! Used ${requestsUsed} API requests in ${executionTime}s`);
}

updateReadme();
