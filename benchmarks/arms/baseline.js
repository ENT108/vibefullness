// Baseline arm: no skill, just the task. The control — these gates should mostly
// FAIL here. That delta against the vibefullness arm is the point.
module.exports = ({ vars }) => [{ role: 'user', content: vars.task }];
